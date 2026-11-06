from django import forms
from django.core.exceptions import ValidationError

from surveys.learner import CATALOG, validate_survey


def validate_delivery(data):
    errors = {}
    try:
        if not isinstance(data.get("email"), str):
            raise ValidationError("invalid")
        email = forms.EmailField(max_length=254).clean(data["email"]).lower()
    except ValidationError:
        email = ""
        errors["email"] = "invalid"
    rating = data.get("rating")
    if type(rating) is not int or not 1 <= rating <= 5:
        errors["rating"] = "invalid"
    language = data.get("language")
    if language not in ("ko", "en", "id"):
        errors["language"] = "invalid"
    if errors:
        raise ValidationError(errors)
    return {"email": email, "rating": rating, "language": language}
