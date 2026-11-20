"""INTEGRATION tests: paying online with PayRex, start to finish.

Real backend + test database + the PayRex stand-in. Each test is one journey a
customer or PayRex can take.
"""

import pytest

from tests.conftest import order_body, sql

pytestmark = pytest.mark.integration


def stock(db, product_id):
    return sql(db, "select stock_qty from products where product_id = :p", p=product_id)[0][0]


def order_row(db, number):
    return sql(db, "select payment_status, order_status, notes from orders where order_number = :n", n=number)[0]


def place_online(client, customer, **changes):
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online", **changes))
    assert r.status_code == 201, r.text
    return r.json()


def test_pay_online_then_webhook_marks_order_paid(client, clean_db, customer, payrex):
    client.post("/api/cart/items", headers=customer, json={"product_id": 1, "quantity": 2})
    client.post("/api/cart/items", headers=customer, json={"product_id": 2, "quantity": 1})   # not bought now
    before = stock(clean_db, 1)

    placed = place_online(client, customer, items=[{"id": 1, "quantity": 2}])
    assert placed["checkout_url"].startswith("https://checkout.payrexhq.com/")
    assert order_row(clean_db, placed["order_number"])[:2] == ("unpaid", "pending")
    assert stock(clean_db, 1) == before - 2                       # held while they pay
    assert len(client.get("/api/cart", headers=customer).json()["items"]) == 2   # cart kept until paid

    intent = payrex.customer_pays(payrex.last_session()["id"])
    body, headers = payrex.webhook(intent)
    r = client.post("/api/payments/payrex-webhook", content=body, headers=headers)
    assert r.status_code == 200 and r.json() == {"received": True}

    assert order_row(clean_db, placed["order_number"])[:2] == ("paid", "processing")
    cart = client.get("/api/cart", headers=customer).json()["items"]
    assert [line["product_id"] for line in cart] == [2]           # only the bought item left the cart


def test_same_webhook_twice_is_harmless(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    body, headers = payrex.webhook(payrex.customer_pays(payrex.last_session()["id"]))
    for _ in range(2):
        assert client.post("/api/payments/payrex-webhook", content=body, headers=headers).status_code == 200
    assert order_row(clean_db, placed["order_number"])[:2] == ("paid", "processing")


def test_live_mode_signature_is_accepted(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    body, headers = payrex.webhook(payrex.customer_pays(payrex.last_session()["id"]), live=True)
    assert client.post("/api/payments/payrex-webhook", content=body, headers=headers).status_code == 200
    assert order_row(clean_db, placed["order_number"])[0] == "paid"


def test_forged_webhook_is_refused(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    intent = payrex.customer_pays(payrex.last_session()["id"])
    body, headers = payrex.webhook(intent, secret="whsk_attacker")
    r = client.post("/api/payments/payrex-webhook", content=body, headers=headers)
    assert r.status_code == 400
    assert order_row(clean_db, placed["order_number"])[0] == "unpaid"


def test_webhook_that_lies_about_payment_is_not_trusted(client, clean_db, customer, payrex):
    """A correctly signed message, but PayRex itself says the payment didn't go through."""
    placed = place_online(client, customer)
    intent = dict(payrex.last_session()["payment_intent"], status="succeeded")   # message says paid...
    body, headers = payrex.webhook(intent)                                      # ...PayRex says not yet
    assert client.post("/api/payments/payrex-webhook", content=body, headers=headers).status_code == 200
    assert order_row(clean_db, placed["order_number"])[0] == "unpaid"


def test_wrong_amount_is_flagged_not_marked_paid(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    intent = payrex.customer_pays(payrex.last_session()["id"], amount=100)   # ₱1 instead of ₱450
    body, headers = payrex.webhook(intent)
    assert client.post("/api/payments/payrex-webhook", content=body, headers=headers).status_code == 200
    status, _, notes = order_row(clean_db, placed["order_number"])
    assert status == "unpaid" and "didn't match" in notes


def test_other_event_types_are_acknowledged_and_ignored(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    body, headers = payrex.webhook(payrex.last_session()["payment_intent"], event_type="payment_intent.created")
    assert client.post("/api/payments/payrex-webhook", content=body, headers=headers).json() == {"received": True}
    assert order_row(clean_db, placed["order_number"])[0] == "unpaid"


def test_confirmation_page_checks_payrex_when_webhook_is_late(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    payrex.customer_pays(payrex.last_session()["id"])            # paid, but no webhook yet
    r = client.get(f"/api/orders/{placed['order_number']}", params={"token": placed["access_token"]})
    assert r.status_code == 200 and r.json()["payment_status"] == "paid"


def test_expired_payment_page_cancels_order_and_returns_stock(client, clean_db, customer, payrex):
    before = stock(clean_db, 1)
    placed = place_online(client, customer)
    payrex.last_session()["status"] = "expired"
    r = client.get(f"/api/orders/{placed['order_number']}", params={"token": placed["access_token"]})
    assert r.json()["order_status"] == "cancelled"
    assert stock(clean_db, 1) == before


def test_back_button_on_payrex_expires_session_and_cancels(client, clean_db, customer, payrex):
    before = stock(clean_db, 1)
    placed = place_online(client, customer)
    session_id = payrex.last_session()["id"]
    r = client.post(f"/api/orders/{placed['order_number']}/cancel", params={"token": placed["access_token"]})
    assert r.json()["order_status"] == "cancelled"
    assert payrex.sessions[session_id]["status"] == "expired"    # the payment page can't be used any more
    assert stock(clean_db, 1) == before


def test_cancel_after_paying_keeps_the_order(client, clean_db, customer, payrex):
    placed = place_online(client, customer)
    payrex.customer_pays(payrex.last_session()["id"])
    r = client.post(f"/api/orders/{placed['order_number']}/cancel", params={"token": placed["access_token"]})
    assert r.json()["payment_status"] == "paid" and r.json()["order_status"] == "processing"


def test_payrex_refusal_leaves_no_half_made_order(client, clean_db, customer, payrex):
    before = stock(clean_db, 1)
    payrex.refuse_next_create = (400, {"errors": [{"code": "parameter_invalid", "detail": "bad", "parameter": "x"}]})
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    assert r.status_code == 502
    assert sql(clean_db, "select count(*) from orders")[0][0] == 0
    assert stock(clean_db, 1) == before


def test_payrex_unreachable_is_handled(client, clean_db, customer, payrex, http):
    http.network_down.add("api.payrexhq.com")
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    assert r.status_code == 502 and "PayRex could not start the payment" in r.json()["detail"]
    assert sql(clean_db, "select count(*) from orders")[0][0] == 0


def test_public_api_url_sends_customers_back_through_the_backend(client, customer, payrex, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_URL", "https://eligible-rigor-sulk.ngrok-free.dev")
    placed = place_online(client, customer)
    sent = payrex.created[-1]
    assert sent.success_url.startswith("https://eligible-rigor-sulk.ngrok-free.dev/api/payments/return/success?")
    r = client.get("/api/payments/return/success",
                   params={"order": placed["order_number"], "token": placed["access_token"]}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"].startswith("http://localhost:5173/order-confirmation?order=")
