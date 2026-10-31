"""In-memory sliding-window rate limiter (per process). Enough for a single node; use Redis when scaling out."""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry = int(hits[0] + self.window - now) + 1
                raise HTTPException(429, f"Too many attempts. Try again in {retry} seconds.",
                                    headers={"Retry-After": str(retry)})
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def client_ip(request: Request) -> str:
    # Behind a reverse proxy, run uvicorn with --proxy-headers so this is the real client address.
    return request.client.host if request.client else "unknown"


login_limiter = RateLimiter(limit=10, window_seconds=300)
signup_limiter = RateLimiter(limit=5, window_seconds=3600)
