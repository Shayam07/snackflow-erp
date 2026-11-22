"""Structured-ish logging with a per-request correlation id."""
import logging
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-5s [%(request_id)s] %(name)s: %(message)s"
    ))
    handler.addFilter(RequestIdFilter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
    logging.getLogger("uvicorn.access").disabled = True


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attach a request id, log outcome and latency, and echo the id back."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        logger = logging.getLogger("snackflow.request")
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("%s %s failed", request.method, request.url.path)
            raise
        finally:
            request_id_ctx.reset(token)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        log = logger.warning if response.status_code >= 500 else logger.info
        log("%s %s -> %s (%.1f ms)", request.method, request.url.path,
            response.status_code, elapsed_ms)
        return response
