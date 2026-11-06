import csv

from .csv_export import SEOUL, spreadsheet_text
from .learner import CATALOG


SURVEY_COLUMNS = (
    "국적 코드", "출생연도", "TOPIK 응시 목적", "기타 응시 목적", "한국어 학습 기간", "TOPIK II 응시 경험",
    "현재 TOPIK 급수", "목표 TOPIK 급수", "설문 버전", "설문 완료 시각", "동의 버전", "동의 시각",
)
SIGNUP_COLUMNS = ("회원 ID", "이메일", "닉네임", "언어") + SURVEY_COLUMNS
EXAM_COLUMNS = (
    "응시 ID", "이메일", "시험 방식", "시험명", "영역", "모드", "점수", "별점", "언어", "시험 제출 시각", "메일 상태",
) + SURVEY_COLUMNS
REASONS = {row[0]: row[1] for row in CATALOG["reasons"]}
STUDY_DURATIONS = {row[0]: row[1] for row in CATALOG["studyDurations"]}
EXPERIENCES = {row[0]: row[1] for row in CATALOG["experiences"]}


def seoul_time(value):
    return value.astimezone(SEOUL).isoformat() if value is not None else ""


def survey_values(response):
    return (
        response.nationality_code, response.birth_year,
        "; ".join(REASONS.get(code, code) for code in response.topik_reasons),
        response.topik_reason_other,
        STUDY_DURATIONS.get(response.korean_study_duration, response.korean_study_duration),
        EXPERIENCES.get(response.topik_experience, response.topik_experience),
        "급수 없음" if response.current_topik_level == 0 else response.current_topik_level,
        response.target_topik_level, response.survey_version, seoul_time(response.survey_completed_at),
        response.privacy_consent_version, seoul_time(response.privacy_consented_at),
    )


def write_signup_survey_csv(stream, queryset):
    writer = csv.writer(stream, quoting=csv.QUOTE_ALL)
    writer.writerow(SIGNUP_COLUMNS)
    for response in queryset.select_related("user").iterator(chunk_size=2000):
        row = (response.user_id, response.user.email, response.user.first_name, response.language) + survey_values(response)
        writer.writerow(spreadsheet_text(value) for value in row)


def write_exam_survey_csv(stream, queryset):
    writer = csv.writer(stream, quoting=csv.QUOTE_ALL)
    writer.writerow(EXAM_COLUMNS)
    for response in queryset.select_related("attempt").iterator(chunk_size=2000):
        attempt = response.attempt
        row = (
            response.attempt_id, response.email, attempt.exam_format.upper(), attempt.title,
            {"reading": "읽기", "listening": "듣기"}.get(attempt.section, attempt.section), attempt.get_mode_display(),
            attempt.score, response.rating, response.language, seoul_time(attempt.submitted_at), response.get_email_status_display(),
        ) + survey_values(response)
        writer.writerow(spreadsheet_text(value) for value in row)
