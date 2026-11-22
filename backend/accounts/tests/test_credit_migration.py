import uuid

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

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
        after = [("accounts", "0004_writing_set_credits")]
        executor = MigrationExecutor(connection)
        executor.migrate(after)
        apps = executor.loader.project_state(after).apps
        CreditAccount = apps.get_model("accounts", "CreditAccount")
        CreditTransaction = apps.get_model("accounts", "CreditTransaction")
        self.assertEqual(set(connection.introspection.table_names()), tables)
        self.assertEqual(list(CreditAccount.objects.order_by("user_id").values()), wallets)
        self.assertEqual(list(CreditTransaction.objects.order_by("id").values(*transactions[0])), transactions)
        self.assertFalse(CreditTransaction.objects.exclude(set_id=None).exists())
        self.assertFalse(CreditTransaction.objects.filter(kind__in=["welcome", "unlock"]).exists())
        with connection.cursor() as cursor:
            for table, old_columns in columns.items():
                current = {column.name for column in connection.introspection.get_table_description(cursor, table)}
                self.assertEqual(current, old_columns | ({"set_id"} if table == "credit_transactions" else set()))


class PaidAllocationMigrationTests(TransactionTestCase):
    def test_oldest_paid_order_reconstructed_and_ambiguous_wallet_sent_to_billing(self):
        executor = MigrationExecutor(connection)
        latest = executor.loader.graph.leaf_nodes()
        before = [("accounts", "0012_credit_refunds")]
        executor.migrate(before)
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(latest))
        apps = executor.loader.project_state(before).apps
        Account = apps.get_model("accounts", "CreditAccount")
        Ledger = apps.get_model("accounts", "CreditTransaction")
        Purchase = apps.get_model("accounts", "CreditPurchase")

        def topup(account, balance):
            entry = Ledger.objects.create(account=account, kind="purchase", amount=1000, balance_after=balance, reserved_after=0)
            return Purchase.objects.create(user_id=account.pk, transaction=entry, status="fulfilled", amount=4900,
                                           attempt_id=uuid.uuid4(), stripe_session_id=str(uuid.uuid4()))

        user = get_user_model().objects.create_user(username="older-topups")
        wallet = Account.objects.create(user_id=user.pk, balance=1900)
        first = topup(wallet, 1000)
        second = topup(wallet, 2000)
        Ledger.objects.create(account=wallet, kind="unlock", amount=100, set_id=uuid.uuid4(), balance_after=1900, reserved_after=0)
        uncertain_user = get_user_model().objects.create_user(username="incomplete-ledger")
        uncertain = topup(Account.objects.create(user_id=uncertain_user.pk, balance=700), 1000)
        after = [("accounts", "0013_paid_credit_allocation")]
        executor = MigrationExecutor(connection)
        executor.migrate(after)
        migrated = executor.loader.project_state(after).apps.get_model("accounts", "CreditPurchase")
        self.assertEqual(dict(migrated.objects.values_list("pk", "remaining_credits")),
                         {first.pk: 900, second.pk: 1000, uncertain.pk: None})
