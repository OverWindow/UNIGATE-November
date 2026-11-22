from django.db import migrations, models

from accounts.credit_allocation import debit_sources, exclude_reservations, restore_sources


def backfill(apps, schema_editor):
    Purchase = apps.get_model("accounts", "CreditPurchase")
    Ledger = apps.get_model("accounts", "CreditTransaction")
    Account = apps.get_model("accounts", "CreditAccount")
    credited = Purchase.objects.filter(status="fulfilled", plan_months__isnull=True)
    for user_id in credited.values_list("user_id", flat=True).distinct().iterator():
        orders = {p.transaction_id: p for p in credited.filter(user_id=user_id)}
        paid, outstanding = {}, {}
        balance, previous_time = 0, None
        reliable = True
        entries = Ledger.objects.filter(account_id=user_id).order_by("created_at", "id")
        for row in entries.iterator():
            if previous_time == row.created_at:
                reliable = False
            previous_time = row.created_at
            if row.kind in {"purchase", "grant", "welcome", "plan_bonus", "restore"}:
                balance += row.amount
            elif row.kind in {"capture", "unlock", "refund"}:
                balance -= row.amount
            if balance != row.balance_after:
                reliable = False
            if row.kind == "purchase":
                order = orders.get(row.pk)
                if not order or order.credits != row.amount:
                    reliable = False
                else:
                    paid[str(order.pk)] = row.amount
            elif row.kind in {"capture", "unlock", "refund"}:
                origin = str(row.refund_purchase_id) if row.kind == "refund" else None
                available = paid.copy()
                other_balance = balance + row.amount - sum(paid.values())
                if row.kind != "capture":
                    other_balance -= exclude_reservations(available, row.reserved_after)
                parts = debit_sources(row.amount, available, refund_order=origin, other_balance=other_balance)
                for order_id, quantity in parts:
                    if order_id:
                        paid[order_id] -= quantity
                if origin:
                    outstanding.setdefault(origin, []).extend(parts)
            elif row.kind == "restore":
                sources = outstanding.setdefault(str(row.refund_purchase_id), [])
                if sum(quantity for _, quantity in sources) < row.amount:
                    reliable = False
                for order_id, quantity in restore_sources(row.amount, sources):
                    if order_id:
                        paid[order_id] += quantity
        if reliable and Account.objects.filter(pk=user_id, balance=balance).exists() and len(orders) == len(paid):
            for order_id, remaining in paid.items():
                Purchase.objects.filter(pk=order_id).update(remaining_credits=remaining)
            for order_id, parts in outstanding.items():
                Purchase.objects.filter(pk=order_id).update(refund_sources=parts)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0012_credit_refunds")]
    operations = [
        migrations.AddField("creditpurchase", "remaining_credits", models.PositiveIntegerField(null=True)),
        migrations.AddField("creditpurchase", "refund_attempt_id", models.UUIDField(null=True, editable=False)),
        migrations.AddField("creditpurchase", "refund_review_required", models.BooleanField(default=False)),
        migrations.AddField("creditpurchase", "refund_sources", models.JSONField(default=list, editable=False)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
