import secrets
import time
from functools import partial

import requests
from cachecontrol import CacheControl
from cachecontrol.cache import DictCache
from django.conf import settings
from google.auth.transport.requests import Request
from google.oauth2.id_token import verify_oauth2_token


CERT_CACHE = DictCache()
CHALLENGE_TTL = 10 * 60
PENDING_TTL = 15 * 60


def verify_credential(credential):
    # Cache Google's public certificates according to their HTTP expiry.
    with CacheControl(requests.Session(), cache=CERT_CACHE) as session:
        return verify_oauth2_token(credential, partial(Request(session=session), timeout=5),
                                   audience=settings.GOOGLE_CLIENT_ID)


def pending_flow(request, flow_id, step):
    pending = request.session.get("google_pending")
    if (not settings.GOOGLE_CLIENT_ID or request.user.is_authenticated or not pending
            or pending["step"] != step or pending["expires_at"] <= time.time()
            or not flow_id.isascii() or not secrets.compare_digest(pending["id"], flow_id)):
        return None
    return pending
