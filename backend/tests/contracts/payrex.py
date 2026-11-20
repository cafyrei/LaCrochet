"""PayRex's rules (the "contract"), written down so the tests can check them.

Source: PayRex API reference (docs.payrexhq.com), checked 2026-11-20:
  - Create a CheckoutSession: currency (only PHP), line_items (name, amount in
    centavos as a positive whole number, quantity), success_url, cancel_url,
    payment_methods; optional description, metadata, customer_reference_id,
    expires_at, billing_details_collection, submit_type, payment_method_options.
  - Requests are form-encoded and use the secret key as the HTTP Basic username.
  - Webhooks: header "Payrex-Signature: t=<time>,te=<test sig>,li=<live sig>",
    signature = HMAC-SHA256("<t>.<raw body>", webhook secret), event payload
    {id: evt_..., type, data: {resource: {...}}}.
Note: the reference lists only "card" and "gcash" as payment_methods, while
PayRex's own code samples also use "maya" and "qrph", so all four are allowed here.
"""

import hashlib
import hmac
import re
from typing import Literal, Optional
from urllib.parse import parse_qsl

from pydantic import BaseModel, ConfigDict, Field, field_validator

API_BASE = "https://api.payrexhq.com"
PAYMENT_METHODS = {"card", "gcash", "maya", "qrph"}
SESSION_STATUSES = {"active", "completed", "expired"}
INTENT_STATUSES = {"awaiting_payment_method", "awaiting_next_action", "processing", "awaiting_capture", "succeeded", "canceled"}


# ---------------------------------------------------------------------
# What we SEND to PayRex
# ---------------------------------------------------------------------
class LineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    amount: int = Field(gt=0)        # centavos: ₱450.00 -> 45000
    quantity: int = Field(ge=1)
    description: Optional[str] = None
    image: Optional[str] = None

    @field_validator("amount", "quantity", mode="before")
    @classmethod
    def whole_number(cls, value):
        # On the wire everything is text; it must be a plain whole number (no "450.00").
        if isinstance(value, str) and not re.fullmatch(r"\d+", value):
            raise ValueError(f"must be a whole number, got {value!r}")
        return value


class CheckoutSessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currency: Literal["PHP"]
    line_items: list[LineItem] = Field(min_length=1)
    success_url: str
    cancel_url: str
    payment_methods: list[str] = Field(min_length=1)
    description: Optional[str] = None
    metadata: Optional[dict[str, str]] = None
    customer_reference_id: Optional[str] = None
    expires_at: Optional[int] = None
    billing_details_collection: Optional[Literal["always", "auto"]] = None
    submit_type: Optional[str] = None
    payment_method_options: Optional[dict] = None

    @field_validator("success_url", "cancel_url")
    @classmethod
    def absolute_url(cls, value: str) -> str:
        if not re.match(r"^https?://[^/\s]+", value):
            raise ValueError(f"must be a full web address, got {value!r}")
        return value

    @field_validator("payment_methods")
    @classmethod
    def known_methods(cls, value: list[str]) -> list[str]:
        unknown = set(value) - PAYMENT_METHODS
        if unknown:
            raise ValueError(f"unknown payment methods {sorted(unknown)}")
        return value


def parse_form(body: str) -> dict:
    """Turn PayRex's form encoding back into a dict.

    "line_items[][name]=Bag&line_items[][amount]=45000&metadata[order_number]=LC-1"
    -> {"line_items": [{"name": "Bag", "amount": "45000"}], "metadata": {"order_number": "LC-1"}}
    A repeated key inside a "[]" list starts a new list item.
    """
    result: dict = {}
    for raw_key, value in parse_qsl(body, keep_blank_values=True):
        parts = re.findall(r"[^\[\]]+|\[\]", raw_key)
        parts = [p if p == "[]" else p for p in parts]
        node = result
        for index, part in enumerate(parts):
            last = index == len(parts) - 1
            nxt = None if last else parts[index + 1]
            if part == "[]":
                continue
            if nxt == "[]":
                lst = node.setdefault(part, [])
                if index + 2 == len(parts):          # simple list: payment_methods[]=gcash
                    lst.append(value)
                    break
                child_key = parts[index + 2]         # list of objects: line_items[][name]
                if not lst or child_key in lst[-1]:
                    lst.append({})
                node = lst[-1]
                continue
            if last:
                node[part] = value
            else:
                node = node.setdefault(part, {})
    return result


# ---------------------------------------------------------------------
# What we READ from PayRex (only the parts our code relies on)
# ---------------------------------------------------------------------
class CheckoutSessionResponse(BaseModel):
    id: str = Field(pattern=r"^cs_")
    url: str = Field(pattern=r"^https://")
    status: str

    @field_validator("status")
    @classmethod
    def known_status(cls, value):
        if value not in SESSION_STATUSES:
            raise ValueError(f"unknown checkout session status {value!r}")
        return value


class PaymentIntentResponse(BaseModel):
    id: str = Field(pattern=r"^pi_")
    amount: int
    status: str
    metadata: Optional[dict] = None
    description: Optional[str] = None

    @field_validator("status")
    @classmethod
    def known_status(cls, value):
        if value not in INTENT_STATUSES:
            raise ValueError(f"unknown payment intent status {value!r}")
        return value


class WebhookEventData(BaseModel):
    resource: dict


class WebhookEvent(BaseModel):
    id: str = Field(pattern=r"^evt_")
    type: str
    livemode: bool
    data: WebhookEventData


def sign_webhook(body: bytes, secret: str, timestamp: int, live: bool = False) -> str:
    """Build a Payrex-Signature header exactly like PayRex does."""
    signature = hmac.new(secret.encode(), str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},te={'' if live else signature},li={signature if live else ''}"
