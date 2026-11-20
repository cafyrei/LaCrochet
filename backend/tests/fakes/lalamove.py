"""A stand-in for Lalamove's sandbox that follows Lalamove's documented rules.

Every request must carry a correct signature and a body that matches
tests/contracts/lalamove.py. It keeps quotes and orders, and the tests can move
an order along (rider found, picked up, delivered) like a real rider would.
"""

import itertools
import json
import math
import time
import uuid
from datetime import datetime, timedelta, timezone

from tests.contracts import lalamove as contract

BASE = contract.SANDBOX_BASE.replace(".", r"\.")
QUOTE_MINUTES = 5


class FakeLalamove:
    def __init__(self, http, api_key: str, secret: str):
        self.api_key, self.secret = api_key, secret
        self.quotes: dict[str, dict] = {}
        self.orders: dict[str, dict] = {}
        self.price_bump = 0               # make the next prices higher (prices move between checkout and booking)
        self._ids = itertools.count(1)
        http.route("POST", rf"{BASE}/v3/quotations", self._quote)
        http.route("POST", rf"{BASE}/v3/orders", self._place)
        http.route("GET", rf"{BASE}/v3/orders/(\w+)", self._get)
        http.route("GET", rf"{BASE}/v3/orders/(\w+)/drivers/(\w+)", self._driver)
        http.route("DELETE", rf"{BASE}/v3/orders/(\w+)", self._cancel)

    # ---- checks every request must pass ----
    def _check_signature(self, sent):
        auth = sent.headers.get("Authorization", "")
        assert auth.startswith("hmac "), f"Authorization must start with 'hmac ': {auth!r}"
        key, timestamp, signature = auth[5:].split(":")
        assert key == self.api_key, "wrong Lalamove API key"
        assert timestamp.isdigit() and len(timestamp) == 13, "timestamp must be in milliseconds"
        assert abs(time.time() * 1000 - int(timestamp)) < 5 * 60 * 1000, "timestamp too old or in the future"
        expected = contract.signature(self.secret, timestamp, sent.method, sent.path, sent.body)
        assert signature == expected, "signature doesn't match Lalamove's formula"
        assert sent.headers.get("Market") == "PH", "Market header must be PH"
        uuid.UUID(sent.headers.get("Request-ID", ""))  # must be a unique id
        if sent.body:
            assert sent.headers.get("Content-Type") == "application/json"

    @staticmethod
    def _error(status, code, message):
        return status, {"errors": [{"id": code, "message": message}]}

    # ---- endpoints ----
    def _quote(self, sent):
        self._check_signature(sent)
        body = contract.QuotationRequest.model_validate(json.loads(sent.body)).data
        (a, b) = (body.stops[0].coordinates, body.stops[-1].coordinates)
        if float(b.lat) > 19.0:
            return self._error(422, "ERR_OUT_OF_SERVICE_AREA", "Out of service area")
        km = _km(float(a.lat), float(a.lng), float(b.lat), float(b.lng))
        self.last_km = km
        total = round(49 + 7 * km) + self.price_bump
        quote_id = f"{next(self._ids):019d}"
        quote = {
            "quotationId": quote_id, "serviceType": body.serviceType, "language": body.language,
            "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=QUOTE_MINUTES)).isoformat(),
            "priceBreakdown": {"base": "49", "extraMileage": str(total - 49), "total": str(total), "currency": "PHP"},
            "stops": [{"stopId": f"{quote_id}{i}", "coordinates": s.coordinates.model_dump(), "address": s.address}
                      for i, s in enumerate(body.stops)],
            "distance": {"value": str(int(km * 1000)), "unit": "m"},
            "isRouteOptimized": False,
        }
        self.quotes[quote_id] = quote
        return 201, {"data": quote}

    def _place(self, sent):
        self._check_signature(sent)
        body = contract.PlaceOrderRequest.model_validate(json.loads(sent.body)).data
        quote = self.quotes.get(body.quotationId)
        if quote is None:
            return self._error(422, "ERR_INVALID_QUOTATION_ID", "Quotation not found")
        if datetime.fromisoformat(quote["expiresAt"]) < datetime.now(timezone.utc):
            return self._error(422, "ERR_QUOTATION_EXPIRED", "Quotation expired")
        assert body.sender.stopId == quote["stops"][0]["stopId"], "sender must use the first stop"
        assert body.recipients[0].stopId == quote["stops"][-1]["stopId"], "recipient must use the last stop"
        order_id = f"{next(self._ids):018d}"
        order = {
            "orderId": order_id, "quotationId": quote["quotationId"], "priceBreakdown": quote["priceBreakdown"],
            "driverId": "", "shareLink": f"https://share.sandbox.lalamove.com/?{order_id}",
            "status": "ASSIGNING_DRIVER", "distance": quote["distance"], "stops": quote["stops"],
            "metadata": body.metadata, "_matched_at": None,
            "_sender": body.sender.model_dump(), "_recipients": [r.model_dump() for r in body.recipients],
        }
        self.orders[order_id] = order
        return 201, {"data": _public(order)}

    def _get(self, sent, order_id):
        self._check_signature(sent)
        if order_id not in self.orders:
            return self._error(404, "ERR_ORDER_NOT_FOUND", "Order not found")
        return 200, {"data": _public(self.orders[order_id])}

    def _driver(self, sent, order_id, driver_id):
        self._check_signature(sent)
        order = self.orders.get(order_id)
        if not order or order["driverId"] != driver_id:
            return self._error(404, "ERR_DRIVER_NOT_FOUND", "Driver not found")
        return 200, {"data": {"driverId": driver_id, "name": "Juan Dela Cruz", "phone": "+639181112222",
                              "plateNumber": "NAB 1234", "photo": ""}}

    def _cancel(self, sent, order_id):
        self._check_signature(sent)
        order = self.orders[order_id]
        matched = order["_matched_at"]
        allowed = order["status"] == "ASSIGNING_DRIVER" or (
            order["status"] == "ON_GOING" and matched and time.time() - matched < 300
        )
        if not allowed:
            return self._error(422, "ERR_CANCELLATION_FORBIDDEN", "Cancellation forbidden")
        order["status"] = "CANCELED"
        return 204, None

    # ---- the rider's side ----
    def set_status(self, order_id: str, status: str, minutes_since_match: float = 0):
        order = self.orders[order_id]
        order["status"] = status
        if status == "ON_GOING" and not order["driverId"]:
            order["driverId"] = "80557"
            order["_matched_at"] = time.time() - minutes_since_match * 60

    def expire_quotes(self):
        for quote in self.quotes.values():
            quote["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()


def _public(order: dict) -> dict:
    return {k: v for k, v in order.items() if not k.startswith("_")}


def _km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
