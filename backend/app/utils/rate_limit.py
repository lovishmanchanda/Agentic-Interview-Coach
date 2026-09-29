"""In-memory sliding-window rate limits (per process). Enough to stop password guessing and runaway LLM spend
from one account; a shared store (Redis / API Management) replaces it when the app runs on several workers.

Keys are a user ID or a client IP. Behind a reverse proxy, run uvicorn with --proxy-headers so the IP is the
caller's, not the proxy's.
"""
import time
from collections import OrderedDict, deque

from app.utils.exceptions import TooManyRequestsError

MAX_KEYS = 50_000  # oldest keys are dropped beyond this, so memory stays bounded


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_s: float, *, clock=time.monotonic):
        self.limit, self.window_s, self.clock = limit, window_s, clock
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    def _window(self, key: str) -> deque[float]:
        now = self.clock()
        hits = self._hits.setdefault(key, deque())
        self._hits.move_to_end(key)
        while hits and now - hits[0] > self.window_s:
            hits.popleft()
        while len(self._hits) > MAX_KEYS:
            self._hits.popitem(last=False)
        return hits

    def blocked(self, key: str) -> bool:
        return len(self._window(key)) >= self.limit

    def record(self, key: str) -> None:
        self._window(key).append(self.clock())

    def hit(self, key: str) -> bool:
        """Counts one request; False if it's over the limit (then it isn't counted)."""
        if self.blocked(key):
            return False
        self.record(key)
        return True

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)


def enforce(limiter: SlidingWindowLimiter, key: str, message: str) -> None:
    if not limiter.hit(key):
        raise TooManyRequestsError(message)
