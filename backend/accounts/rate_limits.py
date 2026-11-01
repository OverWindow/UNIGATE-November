import math
import time
from threading import Lock

from django.core.cache import caches
from django.utils.crypto import salted_hmac


_lock = Lock()


def _key(action, email):
    digest = salted_hmac("topiq-auth-rate-limit", email).hexdigest()
    return f"{action}:{digest}"


def check_limit(action, email, limit):
    with _lock:
        record = caches["auth_rate_limit"].get(_key(action, email))
        if record and record["expires"] > time.time() and record["count"] >= limit:
            return max(1, math.ceil(record["expires"] - time.time()))
    return 0


def record_attempt(action, email, limit, window):
    # One process serves two threads; protect the entire read/update sequence.
    with _lock:
        cache = caches["auth_rate_limit"]
        key = _key(action, email)
        now = time.time()
        record = cache.get(key)
        if not record or record["expires"] <= now:
            record = {"count": 0, "expires": now + window}
        record["count"] += 1
        remaining = max(1, math.ceil(record["expires"] - now))
        cache.set(key, record, timeout=remaining)
        return remaining if record["count"] > limit else 0


def clear_login_failures(email):
    with _lock:
        caches["auth_rate_limit"].delete(_key("login", email))
