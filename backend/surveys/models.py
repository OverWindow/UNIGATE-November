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
