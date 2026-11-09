from functools import wraps

from django.core.paginator import EmptyPage, Paginator
from django.db import DatabaseError
from django.db.models import Count
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .models import VocabularySet
from .services import LEVELS, PAGE_SIZE, VocabularyUnavailable, audio_url, set_summary, source_words


def response(data, status=200):
    result = JsonResponse(data, status=status)
    result["Cache-Control"] = "no-store"
    return result


def available(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except (DatabaseError, VocabularyUnavailable):
            return response({"error": "vocabulary_unavailable"}, 503)
    return wrapped


@require_GET
@available
def levels(request):
    counts = {row["topik_level"]: row for row in VocabularySet.objects.order_by().values("topik_level").annotate(
        set_count=Count("id", distinct=True), word_count=Count("items"))}
    return response({"levels": [{
        "level": level, "wordCount": counts.get(level, {}).get("word_count", 0),
        "setCount": counts.get(level, {}).get("set_count", 0),
    } for level in LEVELS]})


@require_GET
@available
def sets(request):
    try:
        level = int(request.GET.get("level", "3"))
        page_number = int(request.GET.get("page", "1"))
        if level not in LEVELS or not 1 <= page_number <= 1000000:
            raise ValueError
    except ValueError:
        return response({"error": "invalid_parameters"}, 400)
    paginator = Paginator(VocabularySet.objects.filter(topik_level=level).prefetch_related("items"), PAGE_SIZE)
    try:
        page = paginator.page(page_number)
    except EmptyPage:
        return response({"error": "page_not_found"}, 404)
    groups = list(page.object_list)
    words = source_words(groups) if groups else {}
    return response({"level": level, "page": page.number, "pageCount": paginator.num_pages,
                     "totalSets": paginator.count, "sets": [set_summary(group, words) for group in groups]})


@require_GET
@available
def detail(request, set_id):
    if set_id > 9223372036854775807:
        return response({"error": "not_found"}, 404)
    group = VocabularySet.objects.prefetch_related("items").filter(pk=set_id).first()
    if group is None:
        return response({"error": "not_found"}, 404)
    words = source_words([group], include_details=True)
    data = set_summary(group, words)
    data["catalogPage"] = (VocabularySet.objects.filter(
        topik_level=group.topik_level, set_number__lt=group.set_number).count() // PAGE_SIZE) + 1
    data["words"] = []
    for item in group.items.all():
        word = words[item.vocabulary_id]
        data["words"].append({
            "id": str(word.pk), "position": item.position, "korean": word.korean,
            "partOfSpeech": word.part_of_speech,
            "meanings": {"en": word.english, "vi": word.vietnamese, "ja": word.japanese,
                         "zh-Hans": word.chinese_simplified, "id": word.indonesian},
            "exampleKorean": word.example_korean, "exampleEnglish": word.example_english,
            "audioUrl": audio_url(word),
        })
    return response(data)
