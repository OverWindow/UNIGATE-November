import json
from pathlib import Path

from django import forms
from django.core.exceptions import ValidationError
from django.utils import timezone


CATALOG = json.loads(Path(__file__).with_name("survey_catalog.json").read_text(encoding="utf-8"))


def validate_survey(data):
    if not isinstance(data, dict):
        raise ValidationError({"survey": "required"})
    errors = {}
    result = {}
    for key, column, allowed in (
        ("nationalityCode", "nationality_code", CATALOG["countries"] + ["OTHER"]),
        ("koreanStudyDuration", "korean_study_duration", [v[0] for v in CATALOG["studyDurations"]]),
        ("topikExperience", "topik_experience", [v[0] for v in CATALOG["experiences"]]),
    ):
        value = data.get(key)
        if not isinstance(value, str) or value not in allowed:
            errors[key] = "invalid"
        result[column] = value
    for key, column, low, high in (
        ("birthYear", "birth_year", 1950, timezone.localdate().year),
        ("targetTopikLevel", "target_topik_level", 3, 6),
    ):
        value = data.get(key)
        if type(value) is not int or not low <= value <= high:
            errors[key] = "invalid"
        result[column] = value
    reasons = data.get("topikReasons")
    allowed = [v[0] for v in CATALOG["reasons"]]
    if (not isinstance(reasons, list) or not 1 <= len(reasons) <= len(allowed)
            or any(not isinstance(v, str) or v not in allowed for v in reasons)
            or len(set(reasons)) != len(reasons)):
        errors["topikReasons"] = "invalid"
        reasons = []
    result["topik_reasons"] = [v for v in allowed if v in reasons]
    other = data.get("topikReasonOther")
    if "other" in reasons and (not isinstance(other, str) or not other.strip() or len(other.strip()) > 500):
        errors["topikReasonOther"] = "invalid"
    result["topik_reason_other"] = other.strip() if "other" in reasons and isinstance(other, str) else ""
    level = data.get("currentTopikLevel")
    if data.get("topikExperience") != "none" and (type(level) is not int or not 0 <= level <= 6):
        errors["currentTopikLevel"] = "invalid"
    result["current_topik_level"] = None if data.get("topikExperience") == "none" else level
    if data.get("privacyConsent") is not True or data.get("privacyConsentVersion") != CATALOG["consentVersion"]:
        errors["privacyConsent"] = "required"
    if errors:
        raise ValidationError(errors)
    now = timezone.now()
    return result | {"survey_version": CATALOG["version"], "survey_completed_at": now,
                     "privacy_consent_version": CATALOG["consentVersion"], "privacy_consented_at": now}


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
