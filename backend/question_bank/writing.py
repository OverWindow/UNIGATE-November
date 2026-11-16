"""Read PBT writing prompts from the Hub; no attempts or answers are stored."""
import math
from functools import wraps

from django.db import DatabaseError
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .models import WritingQuestion, WritingSet


SLOTS = (51, 52, 53, 54)


class WritingUnavailable(Exception):
    pass


def response(data, status=200):
    result = JsonResponse(data, status=status)
    result["Cache-Control"] = "no-store"
    return result


def available(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except (DatabaseError, WritingUnavailable):
            return response({"error": "writing_unavailable"}, 503)
    return wrapped


def complete_sets():
    complete = WritingQuestion.objects.filter(type_slot__in=SLOTS).values("set_id").annotate(
        total=Count("type_slot"),
    ).filter(total=len(SLOTS)).values("set_id")
    return WritingSet.objects.filter(exam_format="pbt", set_id__in=complete).order_by("created_at", "set_id")


def summary(group, number):
    return {"id": str(group.pk), "number": number, "questionCount": len(SLOTS)}


def text(value):
    if not isinstance(value, str):
        raise WritingUnavailable
    return value


def text_list(value):
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise WritingUnavailable
    return value


def material(source):
    if not isinstance(source, dict) or source.get("kind") not in ("bar", "line"):
        raise WritingUnavailable
    categories = text_list(source.get("categories"))
    series = source.get("series")
    if not categories or not isinstance(series, list) or not series:
        raise WritingUnavailable
    result = []
    for entry in series:
        if not isinstance(entry, dict):
            raise WritingUnavailable
        values = entry.get("values")
        if (not isinstance(values, list) or len(values) != len(categories)
                or not all(type(value) in (int, float) and math.isfinite(value) for value in values)):
            raise WritingUnavailable
        result.append({"label": text(entry.get("label")), "values": values})
    return {"kind": source["kind"], "title": text(source.get("title")),
            "unit": text(source.get("unit", "")), "categories": categories, "series": result}


def question(item):
    source = item.content_json
    if (not isinstance(source, dict) or source.get("exam_format") != "pbt"
            or source.get("section") != "writing" or source.get("type_slot") != item.type_slot):
        raise WritingUnavailable
    materials = source.get("materials", [])
    if not isinstance(materials, list):
        raise WritingUnavailable
    # Expose only prompt fields, even if answers or generation metadata are added upstream.
    result = {
        "number": item.type_slot, "instruction": text(source.get("instruction")),
        "topic": text(source.get("topic", "")), "passage": text(source.get("passage", "")),
        "contextTitle": text(source.get("context_title", "")),
        "requirements": text_list(source.get("requirements", [])),
        "materials": [material(value) for value in materials],
        "materialNotes": text_list(source.get("material_notes", [])),
        "dataSource": text(source.get("data_source", "")),
    }
    if (not result["instruction"].strip()
            or (item.type_slot in (51, 52, 54) and not result["passage"].strip())
            or (item.type_slot == 53 and not result["materials"])
            or (item.type_slot == 54 and not result["requirements"])):
        raise WritingUnavailable
    return result


@require_GET
@available
def sets(request):
    groups = complete_sets().only("set_id", "created_at")
    return response({"sets": [summary(group, number) for number, group in enumerate(groups, 1)]})


@require_GET
@available
def detail(request, set_id):
    groups = complete_sets()
    group = groups.filter(pk=set_id).first()
    if group is None:
        return response({"error": "not_found"}, 404)
    items = list(WritingQuestion.objects.filter(set_id=set_id).order_by("type_slot"))
    if [item.type_slot for item in items] != list(SLOTS):
        raise WritingUnavailable
    number = groups.filter(Q(created_at__lt=group.created_at) | Q(
        created_at=group.created_at, set_id__lt=group.pk,
    )).count() + 1
    return response({**summary(group, number), "questions": [question(item) for item in items]})
