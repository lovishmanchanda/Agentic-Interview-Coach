"""Live metrics (implementation_plan.md 6.2), in memory per process: HTTP requests per route, WebSocket sessions,
and AI calls, over a sliding window, with simple alert rules. Shown on the admin dashboard.

With APPLICATIONINSIGHTS_CONNECTION_STRING set, OpenTelemetry also exports requests and logs to Azure Monitor
(app.main), where alerts can page someone; these in-app numbers are the zero-setup view.
"""
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field

log = logging.getLogger("app.metrics")

WINDOW_S = 15 * 60
MAX_SAMPLES = 5_000


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, round(p / 100 * len(ordered) + 0.5) - 1))]


@dataclass
class _Sample:
    at: float
    latency_ms: float
    ok: bool
    key: str


@dataclass
class AlertRule:
    name: str
    description: str
    min_count: int
    check: object  # (summary) -> bool


@dataclass
class Metrics:
    clock: object = time.time
    http: deque = field(default_factory=lambda: deque(maxlen=MAX_SAMPLES))
    llm: deque = field(default_factory=lambda: deque(maxlen=MAX_SAMPLES))
    ws_durations: deque = field(default_factory=lambda: deque(maxlen=MAX_SAMPLES))
    ws_active: int = 0
    started_at: float = field(default_factory=time.time)
    _firing: set = field(default_factory=set)

    # ── recording ──
    def observe_http(self, route: str, status: int, latency_ms: float) -> None:
        self.http.append(_Sample(self.clock(), latency_ms, status < 500, route))

    def observe_llm(self, call_type: str, model: str, latency_ms: float, ok: bool) -> None:
        self.llm.append(_Sample(self.clock(), latency_ms, ok, f"{call_type}:{model}"))

    def ws_opened(self) -> None:
        self.ws_active += 1

    def ws_closed(self, duration_s: float) -> None:
        self.ws_active = max(0, self.ws_active - 1)
        self.ws_durations.append(_Sample(self.clock(), duration_s * 1000, True, "ws"))

    # ── reading ──
    def _recent(self, samples: deque) -> list[_Sample]:
        cutoff = self.clock() - WINDOW_S
        return [s for s in samples if s.at >= cutoff]

    @staticmethod
    def _summary(samples: list[_Sample]) -> dict:
        latencies = [s.latency_ms for s in samples]
        errors = sum(not s.ok for s in samples)
        return {"count": len(samples), "errors": errors,
                "error_rate": round(errors / len(samples), 4) if samples else 0.0,
                "p50_ms": percentile(latencies, 50), "p95_ms": percentile(latencies, 95)}

    def _by_key(self, samples: list[_Sample]) -> list[dict]:
        groups: dict[str, list[_Sample]] = defaultdict(list)
        for s in samples:
            groups[s.key].append(s)
        rows = [{"key": key, **self._summary(group)} for key, group in groups.items()]
        return sorted(rows, key=lambda r: -r["count"])

    def snapshot(self) -> dict:
        http, llm, ws = self._recent(self.http), self._recent(self.llm), self._recent(self.ws_durations)
        summary = {
            "window_minutes": WINDOW_S // 60, "uptime_s": int(self.clock() - self.started_at),
            "http": {**self._summary(http), "by_route": self._by_key(http)[:30]},
            "llm": {**self._summary(llm), "by_call": self._by_key(llm)},
            "websocket": {"active": self.ws_active, "sessions": len(ws),
                          "p50_duration_s": round((percentile([s.latency_ms for s in ws], 50) or 0) / 1000),
                          "p95_duration_s": round((percentile([s.latency_ms for s in ws], 95) or 0) / 1000)},
        }
        summary["alerts"] = self._alerts(summary)
        return summary

    # ── alerts ──
    RULES = [
        AlertRule("http_errors", "More than 5% of requests failed (5xx)", 20,
                  lambda s: s["http"]["error_rate"] > 0.05),
        AlertRule("llm_errors", "More than 10% of AI calls failed", 10, lambda s: s["llm"]["error_rate"] > 0.10),
        AlertRule("llm_latency", "AI calls are slow (p95 over 20 s)", 10, lambda s: (s["llm"]["p95_ms"] or 0) > 20_000),
        AlertRule("http_latency", "Requests are slow (p95 over 2 s)", 20, lambda s: (s["http"]["p95_ms"] or 0) > 2_000),
    ]

    def _alerts(self, summary: dict) -> list[dict]:
        firing = []
        for rule in self.RULES:
            source = "http" if rule.name.startswith("http") else "llm"
            if summary[source]["count"] >= rule.min_count and rule.check(summary):
                firing.append({"name": rule.name, "description": rule.description})
        names = {a["name"] for a in firing}
        for started in names - self._firing:  # log once when an alert starts, so log-based alerting can pick it up
            log.warning("alert_triggered", extra={"fields": {"alert": started}})
        for ended in self._firing - names:
            log.info("alert_resolved", extra={"fields": {"alert": ended}})
        self._firing = names
        return firing
