"""CONTRACT tests: Lalamove.

Does our Lalamove code sign and shape every request the way Lalamove's v3 API
requires, and read Lalamove's answers and error codes correctly?
See tests/contracts/lalamove.py. These don't need the database.
"""

import json
from decimal import Decimal

import pytest

import lalamove_client as lm
from tests.conftest import FAKE
from tests.contracts import lalamove as contract

pytestmark = pytest.mark.contract


def test_signature_formula_matches_lalamove_docs(http, lalamove):
    lm.quote(14.65, 121.03, "4 Amuslan St, Quezon City")
    sent = http.sent[-1]
    key, timestamp, signature = sent.headers["Authorization"][len("hmac "):].split(":")
    raw = f"{timestamp}\r\nPOST\r\n/v3/quotations\r\n\r\n{sent.body}"
    import hashlib
    import hmac
    assert signature == hmac.new(FAKE["LALAMOVE_API_SECRET"].encode(), raw.encode(), hashlib.sha256).hexdigest()
    assert key == FAKE["LALAMOVE_API_KEY"] and len(timestamp) == 13           # milliseconds
    assert signature == signature.lower() and len(signature) == 64           # lowercase hex


def test_every_request_has_market_and_unique_request_id(http, lalamove):
    lm.quote(14.65, 121.03, "A")
    lm.quote(14.65, 121.03, "B")
    first, second = http.sent[-2:]
    assert first.headers["Market"] == second.headers["Market"] == "PH"
    assert first.headers["Request-ID"] != second.headers["Request-ID"]


def test_sandbox_keys_go_to_the_sandbox(http, lalamove):
    lm.quote(14.65, 121.03, "A")
    assert http.sent[-1].url == contract.SANDBOX_BASE + "/v3/quotations"


def test_quotation_request_shape(http, lalamove):
    lm.quote(14.65, 121.03, "4 Amuslan St, Quezon City")
    body = contract.QuotationRequest.model_validate(http.sent[-1].json())   # extra fields forbidden
    shop, customer = body.data.stops
    assert body.data.serviceType == "MOTORCYCLE" and body.data.language == "en_PH"
    assert (shop.coordinates.lat, shop.coordinates.lng) == ("14.676000", "121.043700")
    assert (customer.coordinates.lat, customer.coordinates.lng) == ("14.650000", "121.030000")


def test_long_addresses_are_cut_to_lalamoves_limit(http, lalamove):
    lm.quote(14.65, 121.03, "x" * 900)
    assert len(http.sent[-1].json()["data"]["stops"][1]["address"]) == 500


def test_quotation_answer_is_read_correctly(http, lalamove):
    result = lm.quote(14.65, 121.03, "A")
    answer = contract.QuotationResponse.model_validate({"data": list(lalamove.quotes.values())[-1]})
    assert result["quotation_id"] == answer.data.quotationId
    assert result["fee"] == Decimal(answer.data.priceBreakdown.total)
    assert result["stop_ids"] == [s.stopId for s in answer.data.stops]
    assert result["distance_km"] > 0


@pytest.mark.parametrize("phone,expected", [
    ("0917 123 4567", "+639171234567"),
    ("09171234567", "+639171234567"),
    ("+63 917 123 4567", "+639171234567"),
    ("639171234567", "+639171234567"),
    ("9171234567", "+639171234567"),
])
def test_phone_numbers_become_e164(phone, expected):
    assert lm.to_e164(phone) == expected
    assert contract.E164_PH.match(lm.to_e164(phone))


def test_place_order_request_shape(http, lalamove):
    booked = lm.book(lat=14.65, lng=121.03, address="4 Amuslan St", customer_name="Ela Santos",
                     customer_phone="09171234567", order_number="LC-2026-0001")
    sent = [s for s in http.sent if s.path == "/v3/orders"][-1]
    body = contract.PlaceOrderRequest.model_validate(sent.json()).data     # extra fields forbidden
    assert body.sender.phone == "+639171234567" and body.sender.name == "La Crochet"
    assert body.recipients[0].name == "Ela Santos"
    assert "LC-2026-0001" in body.recipients[0].remarks
    assert body.metadata == {"order_number": "LC-2026-0001"}
    contract.OrderResponse.model_validate({"data": {k: v for k, v in lalamove.orders[booked["order_id"]].items()
                                                    if not k.startswith("_")}})
    assert booked["status"] == "ASSIGNING_DRIVER" and booked["share_link"].startswith("https://")


def test_booking_uses_a_fresh_quote(http, lalamove):
    """A quote is only good for 5 minutes, so booking always asks for a new one first."""
    lm.book(lat=14.65, lng=121.03, address="A", customer_name="Ela", customer_phone="09171234567",
            order_number="LC-2026-0001")
    paths = [s.path for s in http.sent]
    assert paths[-2:] == ["/v3/quotations", "/v3/orders"]


def test_order_status_and_driver_are_read_correctly(http, lalamove):
    booked = lm.book(lat=14.65, lng=121.03, address="A", customer_name="Ela", customer_phone="09171234567",
                     order_number="LC-2026-0001")
    lalamove.set_status(booked["order_id"], "ON_GOING")
    info = lm.get_order(booked["order_id"])
    assert info["status"] == "ON_GOING" and info["driver_id"] == "80557"
    rider = lm.get_driver(booked["order_id"], info["driver_id"])
    assert rider == {"name": "Juan Dela Cruz", "phone": "+639181112222", "plate_number": "NAB 1234"}


def test_get_order_and_cancel_have_no_body_but_are_signed(http, lalamove):
    booked = lm.book(lat=14.65, lng=121.03, address="A", customer_name="Ela", customer_phone="09171234567",
                     order_number="LC-2026-0001")
    lm.get_order(booked["order_id"])
    lm.cancel(booked["order_id"])
    get_, delete = http.sent[-2:]
    assert (get_.method, delete.method) == ("GET", "DELETE")
    assert get_.body == "" and delete.body == ""   # signed with an empty body, as Lalamove expects


@pytest.mark.parametrize("code,words", [
    ("ERR_OUT_OF_SERVICE_AREA", "doesn't deliver"),
    ("ERR_CANCELLATION_FORBIDDEN", "too late to cancel"),
    ("ERR_QUOTATION_EXPIRED", "expired"),
    ("ERR_INSUFFICIENT_CREDIT", "wallet"),
])
def test_lalamove_error_codes_become_friendly_words(http, code, words):
    http.route("POST", r"https://rest\.sandbox\.lalamove\.com/v3/quotations",
               lambda sent: (422, contract.ErrorResponse.model_validate(
                   {"errors": [{"id": code, "message": "x"}]}).model_dump()))
    with pytest.raises(lm.LalamoveError) as caught:
        lm.quote(14.65, 121.03, "A")
    assert words in str(caught.value) and caught.value.code == code and caught.value.status == 422


def test_unknown_error_falls_back_to_lalamoves_detail(http):
    http.route("POST", r"https://rest\.sandbox\.lalamove\.com/v3/quotations",
               lambda sent: (422, {"errors": [{"id": "ERR_SOMETHING_NEW", "message": "x",
                                               "detail": "Weight is over the limit"}]}))
    with pytest.raises(lm.LalamoveError) as caught:
        lm.quote(14.65, 121.03, "A")
    assert "Weight is over the limit" in str(caught.value)


def test_no_internet_becomes_a_clear_message(http, lalamove):
    http.network_down.add("rest.sandbox.lalamove.com")
    with pytest.raises(lm.LalamoveError) as caught:
        lm.quote(14.65, 121.03, "A")
    assert "Couldn't reach Lalamove" in str(caught.value) and caught.value.code is None


def test_expired_quote_is_refused_like_lalamove_does(http, lalamove):
    data = lm.quote(14.65, 121.03, "A")
    lalamove.expire_quotes()
    with pytest.raises(lm.LalamoveError) as caught:
        lm._request("POST", "/v3/orders", {
            "quotationId": data["quotation_id"],
            "sender": {"stopId": data["stop_ids"][0], "name": "La Crochet", "phone": "+639171234567"},
            "recipients": [{"stopId": data["stop_ids"][1], "name": "Ela", "phone": "+639171234567"}],
        })
    assert caught.value.code == "ERR_QUOTATION_EXPIRED"


def test_body_is_wrapped_in_data_and_compact(http, lalamove):
    lm.quote(14.65, 121.03, "A")
    body = http.sent[-1].body
    assert body.startswith('{"data":{')
    assert body == json.dumps(json.loads(body), separators=(",", ":"))   # compact, exactly what was signed
    assert json.loads(body)["data"]["serviceType"] == "MOTORCYCLE"
