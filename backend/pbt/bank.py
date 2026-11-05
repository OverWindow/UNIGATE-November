"""Read and normalize Hub content; never write to the question bank."""
from urllib.parse import urlsplit

from django.db.models import Prefetch

from question_bank.models import Item, ItemAudioBinding, QuestionSet, VisualAsset
from .formats import EXAM_FORMATS


class BankNotReady(Exception):
    pass


def text(value):
    return value if isinstance(value, str) else ""


def media_url(value):
    value = text(value)
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme in ("https", "http") and parsed.netloc and not parsed.username and not parsed.password else ""
    except ValueError:
        return ""


def load_set(set_id, section, exam_format="pbt"):
    question_set = QuestionSet.objects.filter(pk=set_id, exam_format=exam_format, section=section, review_status__in=["reviewed", "pilot", "active"], published_at__isnull=False).first()
    if not question_set:
        raise BankNotReady("set_unavailable")
    items = list(Item.objects.filter(set_id=set_id).order_by("position").prefetch_related(
        Prefetch("visual_assets", queryset=VisualAsset.objects.filter(is_current=True).order_by("created_at", "visual_asset_id")),
        Prefetch("audio_bindings", queryset=ItemAudioBinding.objects.filter(is_current=True, audio_asset__deleted_at__isnull=True).select_related("audio_asset").order_by("created_at")),
    ))
    count = EXAM_FORMATS[exam_format]["question_count"]
    if [item.position for item in items] != list(range(1, count + 1)):
        raise BankNotReady(f"requires_{count}_questions")
    result = []
    for item in items:
        if item.exam_format != exam_format or item.section != section or item.review_status not in ("reviewed", "pilot", "active") or item.correct_answer not in (1, 2, 3, 4):
            raise BankNotReady("invalid_question")
        content = item.content_json if isinstance(item.content_json, dict) else {}
        choices = item.choices
        if not isinstance(choices, list) or len(choices) != 4 or not all(isinstance(c, str) for c in choices):
            choices = content.get("choices")
        visuals = {}
        material = ""
        for asset in item.visual_assets.all():
            if asset.content_hash != item.content_hash:
                continue
            url = media_url(asset.storage_url)
            if asset.visual_role == "choice" and asset.option_number in (1, 2, 3, 4) and url:
                visuals[str(asset.option_number)] = url
            elif asset.visual_role == "material" and url:
                material = url
        is_visual = section == "listening" and item.item_type in ("visual_scene", "visual_chart", "ibt_visual_scene", "ibt_visual_chart")
        if is_visual:
            if len(visuals) != 4:
                raise BankNotReady("missing_choice_images")
            choices = ["", "", "", ""]
        elif not isinstance(choices, list) or len(choices) != 4 or not all(isinstance(c, str) and c.strip() for c in choices):
            raise BankNotReady("invalid_choices")
        audio_url = ""
        for binding in item.audio_bindings.all():
            if binding.content_hash == item.content_hash:
                audio_url = media_url(binding.audio_asset.storage_url)
        if section == "listening" and not audio_url:
            raise BankNotReady("missing_audio")
        material_positions = (4, 5, 6, 7) if exam_format == "ibt" else (10,)
        if section == "reading" and item.position in material_positions and not material:
            raise BankNotReady("missing_material_image")
        listening = section == "listening"
        prompt = text(content.get("question_prompt"))
        if not prompt:
            prompt = {"grammar_blank": "( )에 들어갈 말로 가장 알맞은 것을 고르십시오.", "similar_expression": "밑줄 친 부분과 의미가 가장 비슷한 것을 고르십시오."}.get(item.item_type, "다음을 듣고 물음에 답하십시오." if listening else "다음을 읽고 물음에 답하십시오.")
        turns = content.get("dialogue_turns", [])
        transcript = "\n".join(f"{text(t.get('speaker'))}: {text(t.get('text'))}" for t in turns if isinstance(t, dict)) if isinstance(turns, list) else ""
        # Whitelist presentation fields: content_json also contains answers and scripts.
        snapshot = {
            "itemType": item.item_type, "prompt": prompt,
            "groupId": item.item_type if exam_format == "pbt" and item.item_type.startswith("paired_") else None,
            "passage": "" if listening else (text(content.get("passage"))
                or (text(content.get("stem")) if exam_format == "ibt" else "") or item.stem),
            "auxiliary": "" if listening else text(content.get("auxiliary_text")),
            "highlight": "" if listening else text(content.get("highlight_text")),
            "choices": choices, "visuals": visuals, "materialUrl": material,
            "audioUrl": audio_url if listening else "",
        }
        result.append({"position": item.position, "source_item_id": item.pk, "snapshot": snapshot,
                       "correct_answer": item.correct_answer, "explanation": item.explanation,
                       "points": 1 if exam_format == "ibt" else 2,
                       "transcript": (transcript or item.stem) if listening else ""})
    if exam_format == "ibt":
        # These slots share one passage/audio; store grouping with the attempt.
        for position in range(15 if section == "listening" else 23, 31, 2):
            first, second = result[position - 1]["snapshot"], result[position]["snapshot"]
            shared_field = "audioUrl" if section == "listening" else "passage"
            if first["itemType"] != second["itemType"] or not first[shared_field] or first[shared_field] != second[shared_field]:
                raise BankNotReady("invalid_question_group")
            first["groupId"] = second["groupId"] = f"ibt-{section}-{position}"
    return result
