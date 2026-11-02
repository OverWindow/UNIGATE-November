import csv
from zoneinfo import ZoneInfo


COLUMNS = ("id", "email", "age", "education_type", "desired_university", "created_at")
SEOUL = ZoneInfo("Asia/Seoul")


def spreadsheet_text(value):
    if value is None:
        return ""
    text = str(value)
    # Treat formula-like user input as text; the database value stays unchanged.
    probe = text.lstrip("\ufeff \t\r\n\v\f")
    if text.startswith(("\t", "\r", "\n")) or probe.startswith(tuple("=+-@＝＋－＠")):
        return "'" + text
    return text


def write_survey_csv(stream, queryset):
    writer = csv.writer(stream, quoting=csv.QUOTE_ALL)
    writer.writerow(COLUMNS)
    count = 0
    rows = queryset.order_by("id").values_list(*COLUMNS).iterator(chunk_size=2000)
    for pk, email, age, education, university, created in rows:
        writer.writerow((pk, spreadsheet_text(email), age, spreadsheet_text(education),
                         spreadsheet_text(university), created.astimezone(SEOUL).isoformat()))
        count += 1
    return count
