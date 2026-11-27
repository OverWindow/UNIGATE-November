import json
import logging
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction


logger = logging.getLogger(__name__)
MEASUREMENT_ID = "G-MNFFKP03XD"


def client_id(value):
    if isinstance(value, str) and re.fullmatch(r"[0-9]{1,20}\.[0-9]{1,20}", value):
        return value
    return None


def browser_client_id(request):
    # Confirmation links keep the Google tag off the page.
    cookie = request.COOKIES.get("_ga", "")
    return client_id(cookie.split(".", 2)[-1]) if cookie.startswith("GA1.") else None


def send_event(query, body):
    request = Request(f"https://www.google-analytics.com/mp/collect?{query}", data=body,
                      headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=2):
            pass
    except OSError:
        logger.warning("TOPIQ GA4 event delivery failed")


def track_after_commit(analytics_id, name, **params):
    secret = settings.TOPIQ_GA4_API_SECRET
    if not analytics_id or not secret:
        return
    if settings.TOPIQ_GA4_DEBUG:
        params.update(debug_mode=True, engagement_time_msec=1)
    query = urlencode({"measurement_id": MEASUREMENT_ID, "api_secret": secret})
    body = json.dumps({"client_id": analytics_id, "events": [{"name": name, "params": params}]}).encode()
    transaction.on_commit(lambda: send_event(query, body), robust=True)


def track_purchase(purchase, *, discount=0, trial_conversion=False, renewal=False):
    item_id = f"plus_{purchase.plan_months}m" if purchase.plan_months else "credit_pack"
    item = {"item_id": item_id, "price": purchase.amount, "quantity": 1}
    params = {
        "transaction_id": str(purchase.pk), "currency": purchase.currency.upper(), "value": purchase.amount,
        "items": [item], "purchase_type": "renewal" if renewal else "initial",
    }
    if discount:
        item["discount"] = discount
        params["discount_amount"] = discount
        params["coupon_applied"] = 1
    track_after_commit(purchase.ga_client_id, "purchase", **params)
    if trial_conversion:
        track_after_commit(purchase.ga_client_id, "trial_convert",
                           transaction_id=str(purchase.pk), plan_months=purchase.plan_months)


def track_refund(purchase, refund):
    track_after_commit(purchase.ga_client_id, "refund", transaction_id=str(purchase.pk),
                       currency=refund.currency.upper(), value=refund.amount)
