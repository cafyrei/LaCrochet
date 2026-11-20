"""Catches every request the backend makes with the `requests` library
(PayRex's library and our Lalamove code both use it) and answers it with a
stand-in. Any request we didn't expect makes the test fail."""

import json
import re
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import requests


@dataclass
class Sent:
    method: str
    url: str
    path: str
    headers: dict
    body: str
    params: dict | None
    auth: object = None
    timeout: object = None
    extra: dict = field(default_factory=dict)

    def json(self):
        return json.loads(self.body) if self.body else None


def response(status: int, body=None) -> requests.Response:
    r = requests.Response()
    r.status_code = status
    r._content = b"" if body is None else json.dumps(body).encode()
    r.headers["Content-Type"] = "application/json"
    r.encoding = "utf-8"
    return r


class FakeHTTP:
    def __init__(self):
        self.sent: list[Sent] = []
        self.routes: list[tuple[str, re.Pattern, object]] = []
        self.network_down = set()   # hosts that act as if the internet is down

    def route(self, method: str, url_pattern: str, handler):
        self.routes.append((method.upper(), re.compile(url_pattern), handler))

    def __call__(self, method, url, **kwargs):
        body = kwargs.get("data")
        if isinstance(body, bytes):
            body = body.decode()
        parts = urlsplit(url)
        sent = Sent(
            method=method.upper(),
            url=url,
            path=parts.path,
            headers=dict(kwargs.get("headers") or {}),
            body=body or "",
            params=kwargs.get("params"),
            auth=kwargs.get("auth"),
            timeout=kwargs.get("timeout"),
        )
        self.sent.append(sent)
        if parts.netloc in self.network_down:
            raise requests.ConnectionError(f"(test) {parts.netloc} is unreachable")
        base = f"{parts.scheme}://{parts.netloc}{parts.path}"
        for verb, pattern, handler in self.routes:
            match = pattern.fullmatch(base)
            if verb == sent.method and match:
                status, payload = handler(sent, *match.groups())
                return response(status, payload)
        raise AssertionError(f"The backend sent a request no test expected: {sent.method} {url}")

    def to(self, host: str) -> list[Sent]:
        return [s for s in self.sent if host in s.url]
