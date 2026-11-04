import io
import json
import uuid

from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase

from .models import AudioAsset, Item, ItemAudioBinding, QuestionSet, SetItemAudioBinding, VisualAsset


class QuestionBankTests(TransactionTestCase):
    def setUp(self):
        # Unmanaged tables are provisioned only inside Django's disposable test DB.
        self.models = (QuestionSet, Item, AudioAsset, ItemAudioBinding, SetItemAudioBinding, VisualAsset)
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA IF NOT EXISTS topik_bank")
        with connection.schema_editor() as editor:
            for model in self.models:
                editor.create_model(model)

    def tearDown(self):
        with connection.schema_editor() as editor:
            for model in reversed(self.models):
                editor.delete_model(model)
        with connection.cursor() as cursor:
            cursor.execute("DROP SCHEMA topik_bank")

    def test_models_map_existing_columns_and_composite_keys(self):
        for model in self.models:
            self.assertFalse(model._meta.managed)
            self.assertEqual(list(model.objects.all()), [])
        self.assertEqual(ItemAudioBinding._meta.pk.field_names, ('item_id', 'content_hash', 'audio_asset_id'))
        self.assertEqual(SetItemAudioBinding._meta.pk.field_names, ('set_id', 'position', 'audio_asset_id'))
        self.assertNotIn('id', [f.name for f in ItemAudioBinding._meta.fields])

    def test_inspection_is_read_only_and_reports_membership(self):
        set_id, item_id = uuid.uuid4(), uuid.uuid4()
        with connection.cursor() as cursor:
            cursor.execute('''INSERT INTO topik_bank.question_sets
                (set_id,exam_format,section,generator_provider,generator_model,generator_version,created_at,
                 set_sequence,review_status,default_target_level,published_at)
                VALUES (%s,'pbt','reading','synthetic','synthetic','synthetic',now(),1,'pending_review',4,now())''', [set_id])
            cursor.execute('''INSERT INTO topik_bank.items
                (item_id,exam_format,source_key,created_at,section,type_slot,item_type,primary_skill,target_level,
                 stem_length,choice_count,generator_provider,generator_model,generator_version,
                 prompt_version,review_status,stem,choices,correct_answer,explanation,content_json,
                 source_provenance,content_hash,updated_at,set_id,position)
                VALUES (%s,'pbt','synthetic',now(),'reading',1,'synthetic','reading',4,1,4,
                        'synthetic','synthetic','synthetic',%s,'pending_review','test','["a","b","c","d"]',
                        1,'test','{}','{}',%s,now(),%s,1)''', [item_id, 'a'*64, 'b'*64, set_id])
        out = io.StringIO()
        call_command('inspect_question_bank', set_id=set_id, stdout=out)
        result = json.loads(out.getvalue())
        self.assertEqual(result['sets'][0]['item_count'], 1)
        self.assertEqual(Item.objects.get(pk=item_id).set.pk, set_id)
        self.assertEqual(Item.objects.get(pk=item_id).stem, 'test')
