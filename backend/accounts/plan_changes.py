from datetime import UTC, datetime

from django.utils import timezone

from .models import PLAN_AMOUNTS


class PlanChangeConflict(Exception):
    pass


class InvalidBillingState(Exception):
    pass


def plan_item(subscription):
    items = subscription["items"]
    if items.get("has_more") or len(items["data"]) != 1:
        raise InvalidBillingState
    item = items["data"][0]
    price = item["price"]
    recurring = price.get("recurring") or {}
    months = recurring.get("interval_count")
    if (item.get("quantity") != 1 or recurring.get("interval") != "month" or months not in PLAN_AMOUNTS
            or price.get("currency") != "krw" or price.get("unit_amount") != PLAN_AMOUNTS[months]):
        raise InvalidBillingState
    return item


def owned_schedule(subscription, schedule):
    return (schedule.get("status") == "active" and schedule.get("subscription") == subscription["id"]
            and schedule.get("customer") == subscription["customer"]
            and schedule.get("end_behavior") == "release"
            and (schedule.get("metadata") or {}).get("topiq_order") == subscription["metadata"]["credit_purchase_id"])


def active_phase(schedule):
    start = schedule["current_phase"]["start_date"]
    for phase in schedule["phases"]:
        if phase["start_date"] == start:
            return phase
    raise InvalidBillingState


def next_change(subscription):
    schedule = subscription.get("schedule")
    if not schedule or not owned_schedule(subscription, schedule):
        return None
    now = timezone.now().timestamp()
    upcoming = [phase for phase in schedule["phases"] if phase["start_date"] > now]
    if not upcoming:
        return None
    phase = upcoming[0]
    metadata = phase.get("metadata") or {}
    months = int(metadata.get("topiq_plan_months", 0))
    if (len(upcoming) != 1 or months not in PLAN_AMOUNTS or str(phase["start_date"]) != metadata.get("topiq_change_at")
            or len(phase["items"]) != 1 or not metadata.get("topiq_plan_price")
            or phase["items"][0]["price"] != metadata["topiq_plan_price"] or phase["items"][0].get("quantity") != 1):
        raise InvalidBillingState
    return {"id": schedule["id"], "months": months, "amount": PLAN_AMOUNTS[months],
            "effectiveAt": datetime.fromtimestamp(phase["start_date"], UTC)}


def read_subscription(api, order, customer_id):
    subscription = api.subscriptions.retrieve(order.stripe_subscription_id, {"expand": ["schedule"]}).to_dict()
    if (not customer_id or subscription.get("id") != order.stripe_subscription_id
            or subscription.get("customer") != customer_id
            or (subscription.get("metadata") or {}).get("credit_purchase_id") != str(order.pk)):
        raise InvalidBillingState
    metadata = subscription["metadata"]
    item = plan_item(subscription)
    price = item["price"]
    expected_price = metadata.get("topiq_plan_price", order.stripe_price_id)
    expected_months = metadata.get("topiq_plan_months", str(order.plan_months))
    if price["id"] != expected_price or str(price["recurring"]["interval_count"]) != expected_months:
        raise InvalidBillingState
    return subscription


def neutral_phase(subscription, schedule):
    # A failed second Stripe call can leave only the original, unmodified phase attached.
    if (schedule.get("status") != "active" or schedule.get("subscription") != subscription["id"]
            or schedule.get("customer") != subscription["customer"] or schedule.get("end_behavior") != "release"
            or any(subscription["metadata"].get(k) != v for k, v in (schedule.get("metadata") or {}).items())
            or len(schedule["phases"]) != 1):
        return False
    phase = schedule["phases"][0]
    item = plan_item(subscription)
    copied_metadata = phase.get("metadata") or {}
    return (phase["start_date"] == schedule["current_phase"]["start_date"]
            and (phase.get("end_date") is None or phase["end_date"] >= item["current_period_end"])
            and len(phase["items"]) == 1
            and phase["items"][0].get("price") == item["price"]["id"] and phase["items"][0].get("quantity") == 1
            and all(subscription["metadata"].get(k) == v for k, v in copied_metadata.items())
            and not any(phase.get(key) for key in ("discounts", "add_invoice_items", "trial_end",
                                                   "default_tax_rates", "transfer_data", "billing_thresholds"))
            and not any(phase["items"][0].get(key) for key in ("discounts", "tax_rates", "billing_thresholds", "metadata")))


def can_schedule(subscription, paid_until):
    item = plan_item(subscription)
    end = item["current_period_end"]
    schedule = subscription.get("schedule")
    return bool(paid_until and timezone.now().timestamp() < end <= paid_until.timestamp()
                and subscription.get("status") == "active" and not subscription.get("cancel_at")
                and not subscription.get("cancel_at_period_end") and not subscription.get("pause_collection")
                and not subscription.get("pending_update") and not subscription.get("discounts")
                and not item.get("discounts") and not item.get("tax_rates") and not subscription.get("default_tax_rates")
                and not (subscription.get("automatic_tax") or {}).get("enabled")
                and item["price"]["recurring"]["interval_count"] < max(PLAN_AMOUNTS)
                and (not schedule or neutral_phase(subscription, schedule)
                     or (owned_schedule(subscription, schedule) and not next_change(subscription))))


def phase_params(phase, end):
    # Keep the current phase's settings when submitting the full list of phases to Stripe.
    params = {key: phase[key] for key in ("currency", "collection_method", "description", "default_payment_method",
              "metadata", "application_fee_percent", "on_behalf_of", "billing_cycle_anchor", "invoice_settings")
              if phase.get(key)}
    if phase.get("automatic_tax"):
        params["automatic_tax"] = {"enabled": phase["automatic_tax"]["enabled"]}
    params.update(start_date=phase["start_date"], end_date=end,
                  items=[{"price": phase["items"][0]["price"], "quantity": 1}])
    return params


def update_change(api, subscription, paid_until, months, effective_at, price=None, schedule_id=None):
    item = plan_item(subscription)
    end = item["current_period_end"]
    if effective_at.timestamp() != end or timezone.now().timestamp() >= end:
        raise PlanChangeConflict
    schedule = subscription.get("schedule")
    if not price and schedule and schedule["id"] != schedule_id:
        raise PlanChangeConflict
    pending = next_change(subscription)
    schedules = api.subscription_schedules
    if pending:
        if (pending["months"], pending["effectiveAt"]) != (months, effective_at):
            raise PlanChangeConflict
        target = schedule["phases"][-1]["items"][0]["price"]
        if price:
            if target != price["priceId"]:
                raise PlanChangeConflict
            return pending
        # Anchor the removal to the old phase. Stripe rejects the edit if renewal won the race.
        active = active_phase(schedule)
        if active["end_date"] != end or active["items"][0]["price"] != item["price"]["id"]:
            raise PlanChangeConflict
        schedules.update(schedule["id"], {"phases": [phase_params(active, end)], "proration_behavior": "none",
                                          "metadata": {"topiq_canceled_change": "1"}, "end_behavior": "release"})
        schedules.release(schedule["id"], {"preserve_cancel_date": True})
        return None
    if not price:
        if (schedule and owned_schedule(subscription, schedule) and
                (schedule.get("metadata") or {}).get("topiq_canceled_change") == "1"):
            # The removal succeeded but detaching may have been interrupted.
            schedules.release(schedule["id"], {"preserve_cancel_date": True})
        elif schedule:
            raise PlanChangeConflict
        return None
    if months <= item["price"]["recurring"]["interval_count"] or not can_schedule(subscription, paid_until):
        raise PlanChangeConflict
    if schedule and (schedule.get("metadata") or {}).get("topiq_canceled_change") == "1":
        # A fresh reservation needs its own identity, including after an interrupted detach.
        schedules.release(schedule["id"], {"preserve_cancel_date": True})
        schedule = None
    if not schedule:
        schedule = schedules.create({"from_subscription": subscription["id"]}).to_dict()
    if not (owned_schedule(subscription, schedule) or neutral_phase(subscription, schedule)):
        raise PlanChangeConflict
    active = active_phase(schedule)
    if active["items"][0]["price"] != item["price"]["id"] or timezone.now().timestamp() >= end:
        raise PlanChangeConflict
    phase = phase_params(active, end)
    metadata = {**(phase.get("metadata") or {}), "credit_purchase_id": subscription["metadata"]["credit_purchase_id"],
                "topiq_plan_months": str(months), "topiq_plan_price": price["priceId"], "topiq_change_at": str(end)}
    future = {**phase, "start_date": end, "duration": {"interval": "month", "interval_count": months},
              "items": [{"price": price["priceId"], "quantity": 1}],
              "metadata": metadata, "proration_behavior": "none", "billing_cycle_anchor": "phase_start"}
    del future["end_date"]
    result = schedules.update(schedule["id"], {
        "end_behavior": "release", "proration_behavior": "none",
        "metadata": {"topiq_order": metadata["credit_purchase_id"]}, "phases": [phase, future],
    }).to_dict()
    change = next_change({**subscription, "schedule": result})
    if change is None:
        # The billing boundary may pass while Stripe processes the request. Reload live state.
        raise PlanChangeConflict
    return change


def release_applied_schedule(subscription, api):
    schedule = subscription["schedule"]
    if isinstance(schedule, str):
        schedule = api.subscription_schedules.retrieve(schedule).to_dict()
    if not owned_schedule(subscription, schedule):
        return
    final = schedule["phases"][-1]
    applied = subscription["metadata"]
    if schedule["current_phase"]["start_date"] != final["start_date"]:
        return
    if ((schedule.get("metadata") or {}).get("topiq_canceled_change") == "1"
            or (str(final["start_date"]) == applied.get("topiq_change_at")
                and (final.get("metadata") or {}).get("topiq_plan_price") == applied.get("topiq_plan_price")
                and plan_item(subscription)["price"]["id"] == applied.get("topiq_plan_price"))):
        api.subscription_schedules.release(schedule["id"], {"preserve_cancel_date": True})
