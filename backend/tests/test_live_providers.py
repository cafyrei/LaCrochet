"""LIVE tests: one small real call to each provider, to prove our contracts still match.

These are OFF by default (they need the internet and your real test keys).
Turn them on with:  set RUN_LIVE_API_TESTS=1   (Windows)   then  python -m pytest -m live

Safety:
- PayRex: only runs with a TEST key (sk_test_...). It makes a ₱20 payment page and closes it right away.
- Lalamove: only runs with a SANDBOX key (pk_test_...). It only asks for a price, it never books a rider.
- Gemini: one short question (uses a tiny bit of your free quota).
"""

import os
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

from tests.contracts import gemini as gemini_contract
from tests.contracts import payrex as payrex_contract

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.getenv("RUN_LIVE_API_TESTS") != "1", reason="live tests are off (set RUN_LIVE_API_TESTS=1)"),
]

REAL = dotenv_values(Path(__file__).resolve().parents[1] / ".env")


def real(name: str) -> str:
    value = (REAL.get(name) or "").strip()
    if not value:
        pytest.skip(f"{name} isn't in backend/.env")
    return value


@pytest.fixture
def real_env(monkeypatch):
    """Swap the fake keys for the real ones from .env, for this test only."""
    for name, value in REAL.items():
        if value is not None:
            monkeypatch.setenv(name, value)


def test_payrex_sandbox_checkout_session(real_env):
    import payrex

    key = real("PAYREX_API_SECRET")
    if not key.startswith("sk_test_"):
        pytest.skip("only runs with a PayRex TEST key")
    client = payrex.Client(key)
    session = client.checkout_sessions.create({
        "currency": "PHP",
        "line_items": [{"name": "La Crochet live contract test", "amount": 2000, "quantity": 1}],
        "payment_methods": ["card", "gcash"],
        "success_url": "https://example.com/success",
        "cancel_url": "https://example.com/cancel",
    })
    try:
        payrex_contract.CheckoutSessionResponse.model_validate(
            {"id": session.id, "url": session.url, "status": session.status,
             "payment_intent": getattr(session, "payment_intent", None)})
    finally:
        client.checkout_sessions.expire(session.id)


def test_lalamove_sandbox_quote(real_env):
    import lalamove_client

    if not real("LALAMOVE_API_KEY").startswith("pk_test_"):
        pytest.skip("only runs with a Lalamove SANDBOX key")
    shop = lalamove_client.shop_location()
    price = lalamove_client.quote(shop["lat"] - 0.02, shop["lng"] - 0.01, "Quezon City, Metro Manila")
    assert price["fee"] > 0 and price["quotation_id"]
    assert len(price["stop_ids"]) == 2


def test_gemini_one_short_question(real_env):
    key = real("GEMINI_API_KEY")
    model = (REAL.get("GEMINI_MODEL") or "gemini-3.8-flash").strip()
    body = {"contents": [{"role": "user", "parts": [{"text": "Reply with the word OK."}]}],
            "generationConfig": {"maxOutputTokens": 20}}
    gemini_contract.GenerateContentRequest.model_validate(body)
    r = requests.post(f"https://generativelanguage.googleapis.com/v1/models/{model}:generateContent",
                      headers={"x-goog-api-key": key}, json=body, timeout=30)
    if r.status_code in (429, 503):
        pytest.skip(f"Gemini is busy or out of free quota right now ({r.status_code})")
    assert r.status_code == 200, r.text[:300]
    assert r.json()["candidates"][0]["content"]["role"] == "model"
