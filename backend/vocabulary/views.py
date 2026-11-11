import json
import random
from functools import wraps

from django.core.paginator import EmptyPage, Paginator
from django.core.exceptions import RequestDataTooBig
from django.db import DatabaseError
from django.db.models import Count
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from question_bank.models import VocabularyQuestion
from .models import VocabularySet
from .services import (LEVELS, PAGE_SIZE, VocabularyUnavailable, audio_url, quiz_word_ids,
                       set_summary, source_words, validate_question, word_meanings)


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
    quiz_words = quiz_word_ids(words) if words else set()
    return response({"level": level, "page": page.number, "pageCount": paginator.num_pages,
                     "totalSets": paginator.count, "sets": [set_summary(group, words, quiz_words) for group in groups]})


@require_GET
@available
def detail(request, set_id):
    if set_id > 9223372036854775807:
        return response({"error": "not_found"}, 404)
    group = VocabularySet.objects.prefetch_related("items").filter(pk=set_id).first()
    if group is None:
        return response({"error": "not_found"}, 404)
    words = source_words([group], include_details=True)
    data = set_summary(group, words, quiz_word_ids(words))
    data["catalogPage"] = (VocabularySet.objects.filter(
        topik_level=group.topik_level, set_number__lt=group.set_number).count() // PAGE_SIZE) + 1
    data["words"] = []
    for item in group.items.all():
        word = words[item.vocabulary_id]
        data["words"].append({
            "id": str(word.pk), "position": item.position, "korean": word.korean,
            "partOfSpeech": word.part_of_speech,
            "meanings": word_meanings(word),
            "exampleKorean": word.example_korean, "exampleEnglish": word.example_english,
            "audioUrl": audio_url(word),
        })
    return response(data)


@require_GET
@available
def questions(request, set_id):
    if set_id > 9223372036854775807:
        return response({"error": "not_found"}, 404)
    group = VocabularySet.objects.prefetch_related("items").filter(pk=set_id).first()
    if group is None:
        return response({"error": "not_found"}, 404)
    words = source_words([group])
    by_word = {}
    for question in VocabularyQuestion.objects.filter(
        vocabulary_id__in=words, question_type="sentence_blank",
    ).only("question_id", "vocabulary_id", "instruction", "stem", "choices",
           "correct_answer", "explanation", "updated_at").order_by("question_id"):
        validate_question(question)
        by_word.setdefault(question.vocabulary_id, []).append(question)
    selected = [random.choice(candidates) for candidates in by_word.values()]
    random.shuffle(selected)
    return response({
        "id": str(group.pk), "level": group.topik_level, "number": group.set_number,
        "wordCount": len(words),
        "catalogPage": (VocabularySet.objects.filter(
            topik_level=group.topik_level, set_number__lt=group.set_number).count() // PAGE_SIZE) + 1,
        "questions": [{"id": str(q.pk), "instruction": q.instruction, "stem": q.stem,
                       "choices": q.choices, "version": q.updated_at.isoformat()} for q in selected],
    })


@require_POST
@available
def check_answer(request, set_id, question_id):
    if request.content_type != "application/json":
        return response({"error": "invalid_answer"}, 400)
    try:
        if len(request.body) > 2048:
            return response({"error": "invalid_answer"}, 400)
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError, RequestDataTooBig):
        return response({"error": "invalid_answer"}, 400)
    if (not isinstance(data, dict) or type(data.get("selectedOption")) is not int
            or not 1 <= data["selectedOption"] <= 4 or not isinstance(data.get("version"), str)):
        return response({"error": "invalid_answer"}, 400)
    if max(set_id, question_id) > 9223372036854775807:
        return response({"error": "not_found"}, 404)
    group = VocabularySet.objects.prefetch_related("items").filter(pk=set_id).first()
    if group is None:
        return response({"error": "not_found"}, 404)
    words = source_words([group], include_details=True)
    question = VocabularyQuestion.objects.filter(
        pk=question_id, vocabulary_id__in=words, question_type="sentence_blank",
    ).only("question_id", "vocabulary_id", "instruction", "stem", "choices",
           "correct_answer", "explanation", "updated_at").first()
    if question is None:
        return response({"error": "not_found"}, 404)
    if data["version"] != question.updated_at.isoformat():
        return response({"error": "question_changed"}, 409)
    validate_question(question)
    word = words[question.vocabulary_id]
    return response({
        "isCorrect": data["selectedOption"] == question.correct_answer,
        "correctAnswer": question.correct_answer, "explanation": question.explanation,
        "word": {"korean": word.korean, "meanings": word_meanings(word)},
    })
