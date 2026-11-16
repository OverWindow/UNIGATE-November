import json
import time
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class ProviderError(Exception):
    pass


def evaluate(request, *, model, options, evaluation_id, timeout):
    body = json.dumps({"model": model, "messages": [
        {"role": "system", "content": request.system}, {"role": "user", "content": request.user},
    ], **options}, ensure_ascii=False).encode("utf-8")
    outgoing = Request("https://api.bizrouter.ai/v1/chat/completions", data=body, headers={
        "Authorization": f"Bearer {settings.BIZROUTER_API_KEY}", "Content-Type": "application/json",
        "X-BizRouter-Client-Request-Id": str(evaluation_id), "X-Title": "TOPIQ Writing",
    }, method="POST")
    deadline = time.monotonic() + timeout
    try:
        with urlopen(outgoing, timeout=timeout) as response:
            chunks, size = [], 0
            while True:
                if time.monotonic() >= deadline:
                    raise TimeoutError
                chunk = response.read1(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > 1_048_576:
                    raise ProviderError("invalid_model_response")
                chunks.append(chunk)
        data = json.loads(b"".join(chunks))
        choice = data["choices"][0]
        if choice.get("finish_reason") != "stop":
            raise ProviderError("incomplete_model_response")
        result = json.loads(choice["message"]["content"])
        usage = {key: value for key, value in data.get("usage", {}).items()
                 if key in {"prompt_tokens", "completion_tokens", "total_tokens"}
                 and type(value) is int and value >= 0}
        resolved_model = data.get("model", model)
        if not isinstance(resolved_model, str) or len(resolved_model) > 200:
            raise ProviderError("invalid_model_response")
        return result, usage, resolved_model
    except HTTPError:
        raise ProviderError("provider_unavailable") from None
    except (TimeoutError, URLError, OSError, HTTPException):
        raise ProviderError("provider_unavailable") from None
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise ProviderError("invalid_model_response") from None
