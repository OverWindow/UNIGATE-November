from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models.functions import Now, Trim
from django.db.models.lookups import Exact


class EducationType(models.TextChoices):
    HIGH_SCHOOL_GRADUATE = "high_school_graduate", "High school graduate (never attended college)"
    UNIVERSITAS = "universitas", "Universitas"
    INSTITUT = "institut", "Institut"
    SEKOLAH_TINGGI = "sekolah_tinggi", "Sekolah Tinggi"
    POLITEKNIK = "politeknik", "Politeknik"
    AKADEMI = "akademi", "Akademi"
    AKADEMI_KOMUNITAS = "akademi_komunitas", "Akademi Komunitas"
    OTHER = "other", "Other"
    UNKNOWN = "unknown", "Unknown"


class SurveyResponse(models.Model):
    email = models.EmailField(max_length=254)
    age = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(120)]
    )
    education_type = models.CharField(max_length=32, choices=EducationType.choices)
    desired_university = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(db_default=Now(), editable=False)

    class Meta:
        db_table = "survey_responses"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(age__gte=0, age__lte=120),
                name="survey_age_range",
            ),
            models.CheckConstraint(
                condition=models.Q(education_type__in=EducationType.values),
                name="survey_education_type_valid",
            ),
            models.CheckConstraint(
                condition=~Exact(Trim("email"), models.Value("")),
                name="survey_email_not_empty",
            ),
            models.CheckConstraint(
                condition=models.Q(desired_university__isnull=True)
                | ~Exact(Trim("desired_university"), models.Value("")),
                name="survey_university_not_empty",
            ),
        ]

    def clean_fields(self, exclude=None):
        # Normalize before field validation. / 필드 검증 전에 공백을 정리합니다.
        if isinstance(self.email, str):
            self.email = self.email.strip()
        if isinstance(self.desired_university, str):
            self.desired_university = self.desired_university.strip() or None
        super().clean_fields(exclude=exclude)

    def save(self, *args, **kwargs):
        # Ordinary ORM writes must validate without an API or form. / 일반 ORM 저장도 검증합니다.
        self.full_clean()
        return super().save(*args, **kwargs)


class SignupSurveyResponse(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, models.CASCADE, primary_key=True, related_name="signup_survey")
    language = models.CharField(max_length=2, choices=[("ko", "한국어"), ("en", "English"), ("id", "Indonesia")])
    nationality_code = models.CharField(max_length=5)
    birth_year = models.PositiveSmallIntegerField()
    topik_reasons = models.JSONField()
    topik_reason_other = models.CharField(max_length=500, blank=True)
    korean_study_duration = models.CharField(max_length=32)
    topik_experience = models.CharField(max_length=16)
    current_topik_level = models.PositiveSmallIntegerField(null=True, blank=True)
    target_topik_level = models.PositiveSmallIntegerField()
    survey_version = models.CharField(max_length=40)
    survey_completed_at = models.DateTimeField()
    privacy_consent_version = models.CharField(max_length=40)
    privacy_consented_at = models.DateTimeField()

    class Meta:
        db_table = "signup_survey_responses"
        ordering = ["-survey_completed_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(target_topik_level__range=(3, 6)), name="signup_survey_target_range"),
            models.CheckConstraint(condition=models.Q(current_topik_level__isnull=True) | models.Q(current_topik_level__range=(0, 6)), name="signup_survey_current_range"),
        ]
