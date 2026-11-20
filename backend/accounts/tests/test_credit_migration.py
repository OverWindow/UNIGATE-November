import uuid

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from accounts.models import CreditAccount, CreditTransaction
from writing.models import Evaluation


class SetCreditMigrationTests(TransactionTestCase):
    def test_adds_only_set_column_and_preserves_existing_balances_and_transactions(self):
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        before = [("accounts", "0003_creditaccount_credittransaction")]
        executor.migrate(before)
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(latest))
        state = executor.loader.project_state(before)
        Account = state.apps.get_model("accounts", "CreditAccount")
        Ledger = state.apps.get_model("accounts", "CreditTransaction")
        user = get_user_model().objects.create_user(username="existing-credit-fixture")
        other = get_user_model().objects.create_user(username="existing-empty-fixture")
        Account.objects.create(user_id=user.pk, balance=380)
        Account.objects.create(user_id=other.pk)
        evaluation = Evaluation.objects.create(user_id=user.pk, set_id=uuid.uuid4(), type_slot=51,
            question_snapshot={}, answer={}, credit_cost=20, status="succeeded", result={}, total_score=0,
            expires_at=timezone.now(), completed_at=timezone.now())
        Ledger.objects.create(account_id=user.pk, kind="grant", amount=400, actor_id=other.pk,
                              balance_after=400, reserved_after=0)
        Ledger.objects.create(account_id=user.pk, evaluation_id=evaluation.pk, kind="capture", amount=20,
                              balance_after=380, reserved_after=0)
        wallets = list(Account.objects.order_by("user_id").values())
        transactions = list(Ledger.objects.order_by("id").values())
        tables = set(connection.introspection.table_names())
        with connection.cursor() as cursor:
            columns = {table: {column.name for column in connection.introspection.get_table_description(cursor, table)}
                       for table in ("credit_accounts", "credit_transactions", "writing_evaluations")}
        MigrationExecutor(connection).migrate([("accounts", "0004_writing_set_credits")])
        self.assertEqual(set(connection.introspection.table_names()), tables)
        self.assertEqual(list(CreditAccount.objects.order_by("user_id").values()), wallets)
        self.assertEqual(list(CreditTransaction.objects.order_by("id").values(*transactions[0])), transactions)
        self.assertFalse(CreditTransaction.objects.exclude(set_id=None).exists())
        self.assertFalse(CreditTransaction.objects.filter(kind__in=["welcome", "unlock"]).exists())
        with connection.cursor() as cursor:
            for table, old_columns in columns.items():
                current = {column.name for column in connection.introspection.get_table_description(cursor, table)}
                self.assertEqual(current, old_columns | ({"set_id"} if table == "credit_transactions" else set()))
