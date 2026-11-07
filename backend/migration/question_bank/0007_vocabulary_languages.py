from django.db import migrations, models


UPGRADE_SQL = """
ALTER TABLE topik_bank.vocabulary
    ADD COLUMN IF NOT EXISTS chinese_simplified TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS indonesian TEXT NOT NULL DEFAULT '';
"""


def apply_schema(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT to_regclass('topik_bank.vocabulary')")
        # Hub provisions missing source tables with the complete current schema.
        if cursor.fetchone()[0] is None:
            return
        schema_editor.execute(UPGRADE_SQL, params=None)
        cursor.execute("""SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,
            pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
            WHERE a.attrelid='topik_bank.vocabulary'::regclass AND NOT a.attisdropped
                AND a.attname IN ('chinese_simplified', 'indonesian')
            ORDER BY a.attname""")
        expected = [(name, "text", True, "", "''::text")
                    for name in ("chinese_simplified", "indonesian")]
        if cursor.fetchall() != expected:
            raise RuntimeError("Incompatible vocabulary language columns; check the Hub schema before migrating.")


class Migration(migrations.Migration):
    dependencies = [("question_bank", "0006_vocabulary_audio")]

    # Reversing would delete transferred translations; restore a backup instead.
    operations = [
        migrations.RunPython(apply_schema),
        migrations.SeparateDatabaseAndState(state_operations=[
            migrations.AddField(model_name="vocabulary", name="chinese_simplified",
                                field=models.TextField(blank=True, default="", db_default="")),
            migrations.AddField(model_name="vocabulary", name="indonesian",
                                field=models.TextField(blank=True, default="", db_default="")),
        ]),
    ]
