"""Allocation rules shared by the ledger and the historical balance migration."""


def debit_sources(amount, paid, *, refund_order=None, other_balance=0):
    # A refund returns the originating lot first, then unpurchased balance.
    def sources():
        if refund_order:
            yield refund_order, paid.get(refund_order, 0)
            yield None, max(0, other_balance)
        for order_id, remaining in paid.items():
            if order_id != refund_order:
                yield order_id, remaining

    parts = []
    for order_id, remaining in sources():
        used = min(amount, remaining)
        if used:
            parts.append([order_id, used])
            amount -= used
        if not amount:
            break
    if amount:
        parts.append([None, amount])
    return parts


def restore_sources(amount, outstanding):
    """Unwind the exact sources of net refund debits, most recent first."""
    parts = []
    while amount and outstanding:
        order_id, remaining = outstanding[-1]
        restored = min(amount, remaining)
        parts.append([order_id, restored])
        amount -= restored
        if remaining == restored:
            outstanding.pop()
        else:
            outstanding[-1] = [order_id, remaining - restored]
    return parts


def exclude_reservations(paid, reserved):
    """Reserve the oldest paid credits first. Return any hold on other credits."""
    for order_id, remaining in paid.items():
        if reserved <= 0:
            break
        held = min(reserved, remaining)
        paid[order_id] -= held
        reserved -= held
    return max(0, reserved)
