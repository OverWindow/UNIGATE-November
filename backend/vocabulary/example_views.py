from functools import wraps

from django.db.models import Exists, OuterRef
from django.views.decorators.http import require_GET

from question_bank.models import Vocabulary
from .dictionary import ExampleLookupError, lookup_meaning
from .example_analysis import parse_selection, validate_example
from .models import VocabularySetItem
from .views import available, response


def lookup_errors(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            return view(*args, **kwargs)
        except ExampleLookupError as error:
            return response({"error": error.code}, error.status)
    return wrapped


def source_example(word_id):
    if not 1 <= word_id <= 9223372036854775807:
        raise ExampleLookupError("not_found", 404)
    membership = VocabularySetItem.objects.filter(
        vocabulary_id=OuterRef("pk"), set__topik_level=OuterRef("topik_level"),
    )
    text = Vocabulary.objects.filter(Exists(membership), pk=word_id).values_list("example_korean", flat=True).first()
    if text is None:
        raise ExampleLookupError("not_found", 404)
    return text


@require_GET
@available
@lookup_errors
def example_meaning(request, word_id):
    start, end, candidates = parse_selection(request.GET)
    text = source_example(word_id)
    surface = request.GET["surface"]
    validate_example(text, request.GET["version"], start, end, surface)
    return response({"surface": surface, "entries": lookup_meaning(candidates, request.GET["lang"])})
