from django.db import migrations


def check_email_conflicts(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            SELECT COUNT(*) FROM (
                SELECT LOWER(BTRIM(email)) FROM auth_user
                WHERE BTRIM(email) <> ''
                GROUP BY LOWER(BTRIM(email)) HAVING COUNT(*) > 1
            ) AS conflicts
        """)
        if cursor.fetchone()[0]:
            raise RuntimeError("Duplicate nonempty email addresses exist; resolve conflicts before migrating.")


class Migration(migrations.Migration):
    initial = True
    dependencies = [("auth", "0012_alter_user_first_name_max_length")]
    operations = [
        migrations.RunPython(check_email_conflicts, migrations.RunPython.noop),
        # A database-only index preserves Django's built-in User model and tables.
        migrations.RunSQL(
            "CREATE UNIQUE INDEX auth_user_email_ci_unique "
            "ON auth_user (LOWER(BTRIM(email))) WHERE BTRIM(email) <> ''",
            reverse_sql="DROP INDEX auth_user_email_ci_unique",
        ),
    ]
