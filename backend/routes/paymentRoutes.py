"""PayRex calls this the moment a customer pays online (a "webhook").

Without it, an online order was only marked paid when the customer came back
to the confirmation page. If they closed the tab after paying, the order stayed
"unpaid" even though the money had arrived.

Safety: anyone on the internet can send a request here, so we
  1. check PayRex's signature (only PayRex knows the webhook secret), and
  2. ask PayRex directly about the payment instead of trusting the message.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import uuid
from decimal import Decimal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from database import get_db
from models.orderModel import Order
from routes.orderRoutes import _centavos, _frontend_url, _payrex, mark_paid

router = APIRouter()
log = logging.getLogger("lacrochet.payments")

ORDER_NUMBER = re.compile(r"LC-\d{4}-\d+")


def signature_is_valid(raw_body: bytes, header: str | None, secret: str) -> bool:
    """Payrex-Signature looks like "t=1700000000,te=<test sig>,li=<live sig>".

    PayRex signs "<t>.<the exact request body>" with HMAC-SHA256 and the webhook
    secret. We do the same sum and check the answers match.
    """
    if not header:
        return False
    parts = dict(part.split("=", 1) for part in header.split(",") if "=" in part)
    timestamp = parts.get("t")
    signatures = [parts.get("li"), parts.get("te")]  # live mode, test mode
    if not timestamp:
        return False

    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    # compare_digest takes the same time whether or not it matches, so it can't be guessed bit by bit.
    return any(sig and hmac.compare_digest(expected, sig) for sig in signatures)


def _order_number_of(intent) -> str | None:
    """Which order a payment belongs to: our metadata first, then the description."""
    metadata = getattr(intent, "metadata", None) or {}
    if metadata.get("order_number"):
        return metadata["order_number"]
    found = ORDER_NUMBER.search(getattr(intent, "description", None) or "")
    return found.group(0) if found else None


@router.post("/payments/payrex-webhook")
async def payrex_webhook(request: Request, db: Session = Depends(get_db)):
    secret = os.getenv("PAYREX_WEBHOOK_SECRET")
    payrex = _payrex()
    if not secret or payrex is None:
        # Not set up yet. Answering with an error makes PayRex try again later.
        log.error("PayRex webhook received but PAYREX_WEBHOOK_SECRET or PAYREX_API_SECRET is missing.")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook is not set up.")

    raw_body = await request.body()
    if not signature_is_valid(raw_body, request.headers.get("Payrex-Signature"), secret):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature.")

    try:
        event = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON.")

    # We only act on successful payments. Everything else: "thanks, got it".
    if event.get("type") != "payment_intent.succeeded":
        return {"received": True}

    data = event.get("data") or {}
    resource = data.get("resource") if isinstance(data.get("resource"), dict) else data
    intent_id = resource.get("id")
    if not intent_id:
        return {"received": True}

    # Ask PayRex for the real payment, rather than trusting what the message says.
    try:
        intent = payrex.payment_intents.retrieve(intent_id)
    except Exception as exc:
        log.warning("Could not look up PayRex payment %s: %s", intent_id, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach PayRex.")  # PayRex retries

    if intent.status != "succeeded":
        return {"received": True}

    order_number = _order_number_of(intent)
    order = (
        db.query(Order).filter(Order.order_number == order_number).with_for_update().first()
        if order_number
        else None
    )
    if order is None or order.payment_method != "online":
        log.warning("PayRex payment %s doesn't match an online order (%s).", intent_id, order_number)
        return {"received": True}

    # The amount paid must be the order's total.
    if intent.amount != _centavos(Decimal(order.total)):
        log.error(
            "PayRex payment %s for %s was %s centavos, but the order total is %s.",
            intent_id, order.order_number, intent.amount, order.total,
        )
        note = f"PayRex payment {intent_id} didn't match this order's total. Check it in PayRex."
        if note not in (order.notes or ""):
            order.notes = f"{order.notes}\n{note}" if order.notes else note
            db.commit()
        return {"received": True}

    if mark_paid(db, order):
        log.info("Order %s marked paid by PayRex webhook (%s).", order.order_number, intent_id)
    db.commit()
    return {"received": True}


# ---------------------------------------------------------------------
# Coming back from the PayRex page (only used when PUBLIC_API_URL is set)
# ---------------------------------------------------------------------
def _order_link(order: str, token: str) -> str:
    """Only forward real-looking order links, and only to our own shop."""
    try:
        uuid.UUID(token)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    if not ORDER_NUMBER.fullmatch(order):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return urlencode({"order": order, "token": token})


@router.get("/payments/return/success")
def back_from_payment(order: str, token: str):
    """PayRex sends the customer here after paying; pass them on to the shop."""
    return RedirectResponse(
        f"{_frontend_url()}/order-confirmation?{_order_link(order, token)}", status.HTTP_303_SEE_OTHER
    )


@router.get("/payments/return/cancel")
def back_from_cancel(order: str, token: str):
    """PayRex sends the customer here if they press back/cancel."""
    return RedirectResponse(
        f"{_frontend_url()}/checkout?payment=cancelled&{_order_link(order, token)}", status.HTTP_303_SEE_OTHER
    )
