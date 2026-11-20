"""INTEGRATION tests: Yarnie the chat helper, start to finish.

Real backend + test database + the Gemini stand-in. Checks what Yarnie is told
(the "briefing sheet"), privacy between customers, backups, and limits.
"""

import pytest

from routes import chatRoutes
from tests.conftest import order_body, sql

pytestmark = pytest.mark.integration


def say(client, text="Hi Yarnie!", headers=None):
    return client.post("/api/chat", headers=headers or {},
                       json={"messages": [{"role": "user", "text": text}]})


def briefing(gemini) -> str:
    return gemini.instructions(gemini.last()["body"])


def product_name(db, product_id):
    return sql(db, "select name from products where product_id = :p", p=product_id)[0][0]


def test_chat_info_when_on_and_off(client, monkeypatch):
    assert client.get("/api/chat/info").json() == {"enabled": True, "limit_per_hour": chatRoutes.GUEST_LIMIT}
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert client.get("/api/chat/info").json()["enabled"] is False


def test_guest_chat_gets_an_answer(client, clean_db, gemini):
    r = say(client)
    assert r.status_code == 200
    assert r.json() == {"reply": "Hello po! I'm Yarnie.", "remaining": chatRoutes.GUEST_LIMIT - 1}
    assert gemini.last()["model"] == "gemini-3.8-flash"


def test_briefing_has_shop_facts_and_products(client, clean_db, gemini):
    say(client)
    sheet = briefing(gemini)
    assert "SHOP FACTS" in sheet and "Lalamove rider" in sheet
    assert product_name(clean_db, 1) in sheet and "/products/1" in sheet
    assert "CUSTOMER: a guest" in sheet


def test_sold_out_and_hidden_products(client, clean_db, gemini):
    sql(clean_db, "update products set stock_qty = 0 where product_id = 1")
    sql(clean_db, "update products set is_active = false where product_id = 2")
    say(client)
    sheet = briefing(gemini)
    line = next(l for l in sheet.splitlines() if f"/products/1 " in l or l.endswith("/products/1"))
    assert "SOLD OUT" in line
    assert product_name(clean_db, 2) not in sheet          # hidden products are never suggested


def test_customer_sees_only_their_own_orders(client, clean_db, gemini, customer, other_customer):
    mine = client.post("/api/orders", headers=customer, json=order_body()).json()["order_number"]
    theirs = client.post("/api/orders", headers=other_customer,
                         json=order_body(customer_name="Ben Cruz", email="ben@example.com")).json()["order_number"]
    say(client, "Where is my order?", headers=customer)
    sheet = briefing(gemini)
    assert mine in sheet
    assert theirs not in sheet and "Ben Cruz" not in sheet
    assert say(client, headers=customer).json()["remaining"] == chatRoutes.MEMBER_LIMIT - 2


def test_busy_main_model_falls_back_to_backup(client, clean_db, gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("error", 503, "UNAVAILABLE")
    r = say(client)
    assert r.status_code == 200
    assert [x["model"] for x in gemini.requests] == ["gemini-3.8-flash", "gemini-3.5-flash-lite"]


def test_all_models_busy_gives_friendly_503_and_does_not_count(client, clean_db, gemini):
    for model in ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"):
        gemini.behaviour[model] = ("error", 503, "UNAVAILABLE")
    r = say(client)
    assert r.status_code == 503 and "very busy" in r.json()["detail"]
    gemini.behaviour.clear()
    assert say(client).json()["remaining"] == chatRoutes.GUEST_LIMIT - 1   # the failed try was given back


def test_wrong_key_gives_502_not_a_crash(client, clean_db, gemini, monkeypatch):
    gemini.api_key = "someone-elses-key"
    try:
        r = say(client)
    finally:
        gemini.api_key = "test-gemini-key"
    assert r.status_code == 502 and "couldn't answer" in r.json()["detail"]


def test_speed_limit(client, clean_db, gemini, monkeypatch):
    monkeypatch.setattr(chatRoutes, "GUEST_LIMIT", 2)
    assert say(client).status_code == 200
    assert say(client).status_code == 200
    r = say(client)
    assert r.status_code == 429 and "try again in about" in r.json()["detail"]
    assert len(gemini.requests) == 2                         # the 3rd never reached Gemini


def test_empty_answer_becomes_a_polite_reply(client, clean_db, gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("empty",)
    r = say(client)
    assert r.status_code == 200 and r.json()["reply"].startswith("Sorry, I can't help with that one")


def test_not_set_up_gives_503(client, clean_db, gemini, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    r = say(client)
    assert r.status_code == 503 and "isn't set up yet" in r.json()["detail"]
    assert gemini.requests == []


def test_last_message_must_be_the_customers(client, clean_db, gemini):
    r = client.post("/api/chat", json={"messages": [{"role": "user", "text": "hi"},
                                                    {"role": "model", "text": "hello"}]})
    assert r.status_code == 422 and gemini.requests == []
