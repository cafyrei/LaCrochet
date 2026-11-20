"""INTERFACE tests: the shapes our website (React) relies on for paying online.

If one of these breaks, a page in the shop would break, even if the backend "works".
The keys listed here are the ones la-crochet-project/src reads.
"""

import pytest

from main import app
from tests.conftest import is_order_number, order_body

pytestmark = pytest.mark.interface

PAYMENT_PATHS = {
    ("post", "/api/orders"),
    ("get", "/api/orders/{order_number}"),
    ("post", "/api/orders/{order_number}/cancel"),
    ("post", "/api/payments/payrex-webhook"),
    ("get", "/api/payments/return/success"),
}


def test_payment_routes_exist():
    paths = app.openapi()["paths"]
    for method, path in PAYMENT_PATHS:
        assert method in paths.get(path, {}), f"{method.upper()} {path} is missing"


def test_place_order_answer(client, clean_db, customer, payrex):
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"order_number", "access_token", "checkout_url"}   # checkout page reads these 3
    assert is_order_number(body["order_number"])
    assert body["checkout_url"].startswith("https://")


def test_cash_order_has_no_payment_link(client, clean_db, customer):
    body = client.post("/api/orders", headers=customer, json=order_body()).json()
    assert body["checkout_url"] is None


def test_confirmation_page_fields(client, clean_db, customer, payrex):
    placed = client.post("/api/orders", headers=customer, json=order_body(payment_method="online")).json()
    order = client.get(f"/api/orders/{placed['order_number']}", params={"token": placed["access_token"]}).json()
    for key in ("order_number", "payment_status", "order_status", "payment_method", "shipping_method",
                "subtotal", "shipping_fee", "total", "items", "lalamove_status", "lalamove_share_link"):
        assert key in order, key
    assert order["payment_status"] in {"unpaid", "paid"}
    assert isinstance(order["total"], (int, float))           # a number, not text
    assert {"product_name", "quantity"} <= set(order["items"][0])


def test_wrong_link_gives_404_with_a_message(client, clean_db, customer):
    placed = client.post("/api/orders", headers=customer, json=order_body()).json()
    r = client.get(f"/api/orders/{placed['order_number']}",
                   params={"token": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 404 and isinstance(r.json()["detail"], str)


def test_payment_error_is_a_readable_message(client, clean_db, customer, payrex):
    payrex.refuse_next_create = (500, {"errors": [{"code": "x", "detail": "boom", "parameter": None}]})
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    assert r.status_code == 502 and isinstance(r.json()["detail"], str)   # the page shows detail as-is


def test_webhook_answers_received(client, clean_db, customer, payrex):
    client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    body, headers = payrex.webhook(payrex.customer_pays(payrex.last_session()["id"]))
    r = client.post("/api/payments/payrex-webhook", content=body, headers=headers)
    assert r.status_code == 200 and r.json() == {"received": True}    # PayRex retries anything else
