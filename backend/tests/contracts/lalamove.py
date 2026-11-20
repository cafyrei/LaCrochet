"""Lalamove's rules (the "contract"), written down so the tests can check them.

Source: Lalamove API v3 developer docs (developers.lalamove.com):
  - Every request is signed: SIGNATURE = HMAC-SHA256 (lowercase hex) of
    "<TIMESTAMP>\\r\\n<METHOD>\\r\\n<PATH>\\r\\n\\r\\n<BODY>" with the API secret,
    sent as "Authorization: hmac <KEY>:<TIMESTAMP>:<SIGNATURE>" (timestamp in ms),
    with a "Market" header (PH) and a unique "Request-ID".
  - Request and response bodies are wrapped in {"data": {...}}.
  - Quotation: serviceType, language, stops (2 to 16) each with coordinates
    {lat, lng} as text and an address; answer has quotationId, priceBreakdown.total,
    stops[].stopId, expiresAt (a quote is good for 5 minutes), distance.
  - Place order: quotationId, sender {stopId, name, phone}, recipients
    [{stopId, name, phone, remarks}], phone numbers in E.164 (+63...).
  - Order statuses: ASSIGNING_DRIVER, ON_GOING, PICKED_UP, COMPLETED, CANCELED,
    REJECTED, EXPIRED. Cancelling is allowed while ASSIGNING_DRIVER or within
    5 minutes of a driver being matched.
"""

import hashlib
import hmac
import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SANDBOX_BASE = "https://rest.sandbox.lalamove.com"
STATUSES = {"ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP", "COMPLETED", "CANCELED", "REJECTED", "EXPIRED"}
E164_PH = re.compile(r"^\+63\d{10}$")
COORD = re.compile(r"^-?\d{1,3}\.\d{1,8}$")


def signature(secret: str, timestamp: str, method: str, path: str, body: str) -> str:
    raw = f"{timestamp}\r\n{method}\r\n{path}\r\n\r\n{body}"
    return hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------------
# What we SEND to Lalamove
# ---------------------------------------------------------------------
class Coordinates(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lat: str
    lng: str

    @field_validator("lat", "lng")
    @classmethod
    def decimal_text(cls, value: str) -> str:
        if not COORD.match(value):
            raise ValueError(f"coordinates must be decimal text like '14.676000', got {value!r}")
        return value


class Stop(BaseModel):
    model_config = ConfigDict(extra="forbid")
    coordinates: Coordinates
    address: str = Field(min_length=1, max_length=500)


class QuotationBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    serviceType: str = Field(pattern=r"^[A-Z_]+$")
    language: Literal["en_PH"]
    stops: list[Stop] = Field(min_length=2, max_length=16)
    scheduleAt: Optional[str] = None
    specialRequests: Optional[list[str]] = None
    isRouteOptimized: Optional[bool] = None
    item: Optional[dict] = None


class QuotationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: QuotationBody


class Contact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stopId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    phone: str
    remarks: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def e164(cls, value: str) -> str:
        if not E164_PH.match(value):
            raise ValueError(f"phone must be E.164 like +639171234567, got {value!r}")
        return value


class PlaceOrderBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quotationId: str = Field(min_length=1)
    sender: Contact
    recipients: list[Contact] = Field(min_length=1)
    isPODEnabled: Optional[bool] = None
    partner: Optional[str] = None
    metadata: Optional[dict[str, str]] = None


class PlaceOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    data: PlaceOrderBody


# ---------------------------------------------------------------------
# What we READ from Lalamove (only the parts our code relies on)
# ---------------------------------------------------------------------
class PriceBreakdown(BaseModel):
    total: str = Field(pattern=r"^\d+(\.\d+)?$")
    currency: str


class QuotationStop(BaseModel):
    stopId: str


class QuotationData(BaseModel):
    quotationId: str
    priceBreakdown: PriceBreakdown
    stops: list[QuotationStop] = Field(min_length=2)
    expiresAt: str
    distance: Optional[dict] = None


class QuotationResponse(BaseModel):
    data: QuotationData


class OrderData(BaseModel):
    orderId: str
    status: str
    shareLink: Optional[str] = None
    driverId: Optional[str] = None
    priceBreakdown: Optional[PriceBreakdown] = None

    @field_validator("status")
    @classmethod
    def known_status(cls, value):
        if value not in STATUSES:
            raise ValueError(f"unknown Lalamove status {value!r}")
        return value


class OrderResponse(BaseModel):
    data: OrderData


class DriverData(BaseModel):
    driverId: str
    name: str
    phone: str
    plateNumber: str


class DriverResponse(BaseModel):
    data: DriverData


class ErrorItem(BaseModel):
    id: str
    message: Optional[str] = None
    detail: Optional[str] = None


class ErrorResponse(BaseModel):
    errors: list[ErrorItem] = Field(min_length=1)
