"""INTERFACE tests: the shapes the Yarnie chat bubble relies on."""

import pytest

from main import app

pytestmark = pytest.mark.interface


def test_chat_routes_exist():
    paths = app.openapi()["paths"]
    assert "get" in paths["/api/chat/info"] and "post" in paths["/api/chat"]


def test_chat_info_shape(client):
    info = client.get("/api/chat/info").json()
    assert set(info) == {"enabled", "limit_per_hour"}
    assert isinstance(info["enabled"], bool) and isinstance(info["limit_per_hour"], int)


def test_chat_answer_shape(client, clean_db, gemini):
    r = client.post("/api/chat", json={"messages": [{"role": "user", "text": "hi"}]})
    assert r.status_code == 200
    assert set(r.json()) == {"reply", "remaining"}
    assert isinstance(r.json()["reply"], str) and isinstance(r.json()["remaining"], int)


@pytest.mark.parametrize("bad", [
    {"messages": []},
    {"messages": [{"role": "robot", "text": "hi"}]},
    {"messages": [{"role": "user"}]},
])
def test_bad_chat_requests_are_refused(client, gemini, bad):
    assert client.post("/api/chat", json=bad).status_code == 422
    assert gemini.requests == []


def test_chat_errors_are_readable(client, clean_db, gemini):
    for model in ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"):
        gemini.behaviour[model] = ("error", 503, "UNAVAILABLE")
    r = client.post("/api/chat", json={"messages": [{"role": "user", "text": "hi"}]})
    assert r.status_code == 503 and isinstance(r.json()["detail"], str)   # the bubble shows detail
