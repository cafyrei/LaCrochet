"""Talking to Lalamove, the delivery riders.

Every request is "signed" with your secret key (like a wax seal), as Lalamove's
docs describe, so Lalamove knows it really came from your shop.

Settings in backend/.env:
    LALAMOVE_API_KEY=pk_test_...        (pk_test_ / sk_test_ = sandbox, no real riders)
    LALAMOVE_API_SECRET=sk_test_...
    SHOP_NAME=La Crochet
    SHOP_PHONE=09171234567              (the rider calls this number at pickup)
    SHOP_ADDRESS=12 Sampaguita St, Bagong Silang, Quezon City
    SHOP_LAT=14.6760                    (your shop's map pin)
    SHOP_LNG=121.0437
Optional:
    LALAMOVE_SERVICE_TYPE=MOTORCYCLE
"""

import hashlib
import hmac
import json
import os
import re
import time
import uuid
from decimal import Decimal

import requests

SANDBOX_URL = "https://rest.sandbox.lalamove.com"
LIVE_URL = "https://rest.lalamove.com"
FINISHED = {"COMPLETED", "CANCELED", "REJECTED", "EXPIRED"}  # no rider is coming any more

# Lalamove's error codes, in words the owner and customers understand.
FRIENDLY_ERRORS = {
    "ERR_OUT_OF_SERVICE_AREA": "Lalamove doesn't deliver to that spot yet.",
    "ERR_INVALID_COORDINATES": "That map pin isn't a place Lalamove can reach.",
    "ERR_DELIVERY_MISMATCH": "That map pin isn't a place Lalamove can reach.",
    "ERR_INSUFFICIENT_CREDIT": "Your Lalamove wallet doesn't have enough balance. Top it up in the Lalamove app.",
    "ERR_INVALID_PHONE_NUMBER": "Lalamove didn't accept a phone number. Check the shop's and customer's numbers.",
    "ERR_CANCELLATION_FORBIDDEN": "It's too late to cancel here: the rider was assigned more than 5 minutes ago. Cancel it in the Lalamove app.",
    "ERR_QUOTATION_EXPIRED": "The delivery price expired. Please try again.",
}


class LalamoveError(Exception):
    def __init__(self, message: str, status: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code


def _setting(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def is_configured() -> bool:
    """True when the keys and the shop's map pin are in .env."""
    return all(_setting(name) for name in ("LALAMOVE_API_KEY", "LALAMOVE_API_SECRET", "SHOP_LAT", "SHOP_LNG"))


def is_sandbox() -> bool:
    return _setting("LALAMOVE_API_KEY").startswith("pk_test")


def shop_location() -> dict:
    return {"lat": float(_setting("SHOP_LAT")), "lng": float(_setting("SHOP_LNG"))}


def to_e164(phone: str) -> str:
    """Philippine mobile number in the format Lalamove wants: 0917 123 4567 -> +639171234567."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("63"):
        return "+" + digits
    if digits.startswith("0"):
        return "+63" + digits[1:]
    if len(digits) == 10 and digits.startswith("9"):
        return "+63" + digits
    return "+" + digits


def _request(method: str, path: str, body: dict | None = None) -> dict:
    key, secret = _setting("LALAMOVE_API_KEY"), _setting("LALAMOVE_API_SECRET")
    body_text = json.dumps({"data": body}, separators=(",", ":")) if body is not None else ""
    timestamp = str(int(time.time() * 1000))

    # The "seal": timestamp, method, path and body, signed with the secret.
    to_sign = f"{timestamp}\r\n{method}\r\n{path}\r\n\r\n{body_text}"
    signature = hmac.new(secret.encode(), to_sign.encode(), hashlib.sha256).hexdigest()

    headers = {
        "Authorization": f"hmac {key}:{timestamp}:{signature}",
        "Market": _setting("LALAMOVE_MARKET", "PH"),
        "Request-ID": str(uuid.uuid4()),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    base_url = SANDBOX_URL if is_sandbox() else LIVE_URL
    try:
        response = requests.request(
            method, base_url + path, data=body_text.encode() if body_text else None, headers=headers, timeout=20
        )
    except requests.RequestException as exc:
        raise LalamoveError("Couldn't reach Lalamove. Check the internet connection and try again.") from exc

    try:
        payload = response.json() if response.content else {}
    except ValueError:
        payload = {}

    if response.status_code >= 400:
        code = payload.get("message") or next(
            (error.get("id") or error.get("message") for error in payload.get("errors", []) if isinstance(error, dict)),
            None,
        )
        detail = next(
            (error.get("detail") for error in payload.get("errors", []) if isinstance(error, dict) and error.get("detail")),
            None,
        )
        message = FRIENDLY_ERRORS.get(code) or detail or code or f"Lalamove answered with error {response.status_code}."
        raise LalamoveError(message, response.status_code, code)

    return payload.get("data", payload) if isinstance(payload, dict) else {}


def _stop(lat, lng, address: str) -> dict:
    return {"coordinates": {"lat": f"{float(lat):.6f}", "lng": f"{float(lng):.6f}"}, "address": address[:500]}


def quote(lat, lng, address: str) -> dict:
    """Ask Lalamove how much a rider costs from the shop to this pin (good for 5 minutes)."""
    shop = shop_location()
    data = _request(
        "POST",
        "/v3/quotations",
        {
            "serviceType": _setting("LALAMOVE_SERVICE_TYPE", "MOTORCYCLE"),
            "language": "en_PH",
            "stops": [
                _stop(shop["lat"], shop["lng"], _setting("SHOP_ADDRESS", "La Crochet shop")),
                _stop(lat, lng, address),
            ],
        },
    )
    distance = data.get("distance") or {}
    meters = float(distance.get("value") or 0) if distance.get("unit", "m") == "m" else 0
    return {
        "quotation_id": data["quotationId"],
        "fee": Decimal(str(data["priceBreakdown"]["total"])),
        "stop_ids": [stop["stopId"] for stop in data.get("stops", [])],
        "expires_at": data.get("expiresAt"),
        "distance_km": round(meters / 1000, 1) if meters else None,
    }


def book(*, lat, lng, address: str, customer_name: str, customer_phone: str, order_number: str) -> dict:
    """Get a fresh price and book a rider straight away."""
    if not _setting("SHOP_PHONE"):
        raise LalamoveError("Add SHOP_PHONE (the number the rider calls at pickup) to backend/.env first.")
    fresh = quote(lat, lng, address)
    data = _request(
        "POST",
        "/v3/orders",
        {
            "quotationId": fresh["quotation_id"],
            "sender": {
                "stopId": fresh["stop_ids"][0],
                "name": _setting("SHOP_NAME", "La Crochet"),
                "phone": to_e164(_setting("SHOP_PHONE")),
            },
            "recipients": [
                {
                    "stopId": fresh["stop_ids"][1],
                    "name": customer_name,
                    "phone": to_e164(customer_phone),
                    "remarks": f"La Crochet order {order_number}",
                }
            ],
            "metadata": {"order_number": order_number},
        },
    )
    return {
        "order_id": str(data["orderId"]),
        "status": data.get("status") or "ASSIGNING_DRIVER",
        "share_link": data.get("shareLink"),
        "fee": Decimal(str((data.get("priceBreakdown") or {}).get("total") or fresh["fee"])),
        "driver_id": data.get("driverId") or None,
    }


def get_order(lalamove_order_id: str) -> dict:
    data = _request("GET", f"/v3/orders/{lalamove_order_id}")
    return {
        "status": data.get("status"),
        "share_link": data.get("shareLink"),
        "driver_id": data.get("driverId") or None,
    }


def get_driver(lalamove_order_id: str, driver_id: str) -> dict | None:
    """Rider's name, phone and plate. Lalamove only shares this near pickup time."""
    try:
        data = _request("GET", f"/v3/orders/{lalamove_order_id}/drivers/{driver_id}")
    except LalamoveError:
        return None
    return {"name": data.get("name"), "phone": data.get("phone"), "plate_number": data.get("plateNumber")}


def cancel(lalamove_order_id: str) -> None:
    """Only allowed while Lalamove is still finding a rider, or within 5 minutes of one being assigned."""
    _request("DELETE", f"/v3/orders/{lalamove_order_id}")
