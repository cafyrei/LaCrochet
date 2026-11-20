"""CONTRACT tests: PayRex.

Do our messages to PayRex follow PayRex's rules, and do we read PayRex's answers
(and webhook messages) the way PayRex sends them? See tests/contracts/payrex.py.
"""

import json
import time
from decimal import Decimal

import pytest

from tests.conftest import FAKE, order_body
from tests.contracts import payrex as contract

pytestmark = pytest.mark.contract


# ---- Pieces that don't need the database ----
def test_amounts_are_sent_in_centavos_as_whole_numbers():
    from routes.orderRoutes import _centavos

    assert _centavos(Decimal("450.00")) == 45000
    assert _centavos(Decimal("120.50")) == 12050      # PayRex's own example
    assert _centavos(Decimal("95.005")) == 9501       # rounds half up, never sends a fraction
    assert isinstance(_centavos(Decimal("1")), int)


def test_webhook_signature_follows_payrex_formula():
    from routes.paymentRoutes import signature_is_valid

    secret, body, t = FAKE["PAYREX_WEBHOOK_SECRET"], b'{"id":"evt_1"}', int(time.time())
    assert signature_is_valid(body, contract.sign_webhook(body, secret, t), secret)              # test mode (te)
    assert signature_is_valid(body, contract.sign_webhook(body, secret, t, live=True), secret)   # live mode (li)


@pytest.mark.parametrize("header", [
    None, "", "t=123", "te=abc,li=def",                       # missing parts
    "t=1700000000,te=deadbeef,li=",                           # wrong signature
])
def test_webhook_signature_rejects_bad_headers(header):
    from routes.paymentRoutes import signature_is_valid

    assert not signature_is_valid(b"{}", header, FAKE["PAYREX_WEBHOOK_SECRET"])


def test_webhook_signature_is_tied_to_the_exact_body_and_secret():
    from routes.paymentRoutes import signature_is_valid

    secret, t = FAKE["PAYREX_WEBHOOK_SECRET"], int(time.time())
    header = contract.sign_webhook(b'{"amount":45000}', secret, t)
    assert not signature_is_valid(b'{"amount":1}', header, secret)          # body changed on the way
    assert not signature_is_valid(b'{"amount":45000}', header, "whsk_other")  # someone else's secret


def test_order_number_is_found_in_metadata_or_description():
    from routes.paymentRoutes import _order_number_of

    class Intent:
        def __init__(self, metadata=None, description=None):
            self.metadata, self.description = metadata, description

    assert _order_number_of(Intent({"order_number": "LC-2026-0007"})) == "LC-2026-0007"
    assert _order_number_of(Intent(None, "La Crochet order LC-2026-0012")) == "LC-2026-0012"
    assert _order_number_of(Intent({}, "something else")) is None


def test_documented_event_sample_matches_our_contract():
    """The event shape from PayRex's docs (data.resource holds the payment)."""
    sample = {
        "id": "evt_123", "resource": "event", "type": "payment_intent.succeeded", "livemode": False,
        "pending_webhooks": 1,
        "data": {"resource": {"id": "pi_123", "resource": "payment_intent", "amount": 45000, "status": "succeeded"},
                 "previous_attributes": {"status": "awaiting_next_action"}},
    }
    event = contract.WebhookEvent.model_validate(sample)
    assert event.data.resource["id"] == "pi_123"


# ---- Our real checkout, checked against PayRex's rules ----
def test_checkout_session_request_follows_payrex_rules(client, customer, payrex):
    r = client.post("/api/orders", headers=customer, json=order_body(
        payment_method="online", items=[{"id": 1, "quantity": 2}, {"id": 4, "quantity": 1}]))
    assert r.status_code == 201, r.text

    sent = payrex.created[-1]                       # already passed CheckoutSessionCreate (extra fields forbidden)
    assert sent.currency == "PHP"
    assert [(i.name, i.amount, i.quantity) for i in sent.line_items] == [
        ("Crochet Daisy Tote Bag", 45000, 2), ("Crochet Bucket Hat", 38000, 1)]
    assert set(sent.payment_methods) <= contract.PAYMENT_METHODS
    order_number = r.json()["order_number"]
    assert sent.metadata == {"order_number": order_number}     # so the webhook can find the order
    assert order_number in sent.description
    assert sent.success_url.startswith("http://localhost:5173/order-confirmation?order=")
    assert sent.cancel_url.startswith("http://localhost:5173/checkout?payment=cancelled&order=")


def test_delivery_fee_is_its_own_line_item(client, customer, payrex, monkeypatch):
    monkeypatch.setenv("LALAMOVE_API_KEY", "")          # Lalamove off: the flat delivery fee is used
    r = client.post("/api/orders", headers=customer, json=order_body(
        payment_method="online", shipping_method="delivery", items=[{"id": 3, "quantity": 1}]))
    assert r.status_code == 201, r.text
    items = [(i.name, i.amount) for i in payrex.created[-1].line_items]
    assert items == [("Crochet Sunflower Keychain", 9500), ("Home delivery", 9000)]   # flat ₱90 (Lalamove off here)


def test_payrex_refusal_is_read_from_its_error_format(client, customer, payrex):
    payrex.refuse_next_create = (400, {"errors": [
        {"code": "parameter_invalid", "detail": "maya is not enabled", "parameter": "payment_methods"}]})
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    assert r.status_code == 502
    assert "payment_methods: maya is not enabled" in r.json()["detail"]   # test keys show PayRex's reason


def test_checkout_session_answer_is_read_correctly(client, customer, payrex):
    r = client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    session = payrex.last_session()
    contract.CheckoutSessionResponse.model_validate(session)
    assert r.json()["checkout_url"] == session["url"]


def test_payrex_requests_use_basic_auth_and_form_encoding(client, customer, payrex, http):
    client.post("/api/orders", headers=customer, json=order_body(payment_method="online"))
    sent = http.to("api.payrexhq.com")
    assert sent and all(s.auth.username == FAKE["PAYREX_API_SECRET"] for s in sent)
    assert all(s.url.startswith(contract.API_BASE + "/") for s in sent)
    assert json.dumps(contract.parse_form(sent[0].body))  # body is form-encoded, not JSON
