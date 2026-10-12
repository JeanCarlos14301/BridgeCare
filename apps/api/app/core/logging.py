import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

REQUEST_ID_HEADER = "X-Request-ID"


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # The uvicorn access log duplicates our metadata log and records client IP addresses.
    logging.getLogger("uvicorn.access").disabled = True


async def metadata_logging_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    # Always server-generated: a client-supplied ID is untrusted input and is never logged.
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    response.headers[REQUEST_ID_HEADER] = request_id
    logging.getLogger("bridgecare.request").info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            }
        )
    )
    return response
