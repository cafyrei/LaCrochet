import logging
import os
import uuid
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from payrex import Client as PayrexClient
from sqlalchemy.orm import Session

import lalamove_client as lalamove
from auth import get_current_user
from database import get_db
from models.addressModel import Address
from models.orderModel import Order, OrderItem
from models.productModel import Product
from models.userModel import User
from routes.cartRoutes import remove_ordered_items
from routes.deliveryRoutes import address_text
from schemas.orderSchemas import MyOrderOut, OrderCreate, OrderCreated, OrderOut

router = APIRouter()
log = logging.getLogger("uvicorn.error")  # shows up in the backend terminal

# Flat delivery fee, only used while Lalamove isn't set up in .env.
DELIVERY_FEE = Decimal("90.00")
PAYREX_METHODS = ["gcash", "card", "maya", "qrph"]
ORDER_NOT_FOUND = "Order not found."


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _public_api_url() -> str:
    """Your backend's internet address (the ngrok one while testing). Optional."""
    return os.getenv("PUBLIC_API_URL", "").rstrip("/")


def _return_urls(order: "Order") -> tuple[str, str]:
    """Where PayRex sends the customer after paying, and after cancelling.

    PayRex refuses addresses on your own computer (localhost). So while testing,
    set PUBLIC_API_URL to your ngrok address: PayRex sends the customer to the
    backend through ngrok, and the backend forwards them to the shop on localhost.
    Once the shop is online (FRONTEND_URL is a real address), leave it unset.
    """
    link = urlencode({"order": order.order_number, "token": str(order.access_token)})
    public_api = _public_api_url()
    if public_api:
        return (
            f"{public_api}/api/payments/return/success?{link}",
            f"{public_api}/api/payments/return/cancel?{link}",
        )
    return (
        f"{_frontend_url()}/order-confirmation?{link}",
        f"{_frontend_url()}/checkout?payment=cancelled&{link}",
    )


def _payrex():
    secret_key = os.getenv("PAYREX_API_SECRET")
    return PayrexClient(secret_key) if secret_key else None


def _payrex_reason(exc: Exception) -> str:
    """Turn a PayRex error into readable text, e.g. "payment_methods: maya is not enabled"."""
    errors = getattr(exc, "errors", None) or []
    parts = [
        f"{error.parameter}: {error.detail}" if error.parameter else (error.detail or error.code or "")
        for error in errors
    ]
    return "; ".join(part for part in parts if part) or repr(exc)


def _centavos(amount: Decimal) -> int:
    """PayRex wants amounts in centavos: ₱450.00 → 45000."""
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _find_order(db: Session, order_number: str, token: str, lock: bool = False) -> Order:
    """Find an order only if the secret token matches; otherwise say 'not found'."""
    try:
        token_uuid = uuid.UUID(token)
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, ORDER_NOT_FOUND)

    query = db.query(Order).filter(
        Order.order_number == order_number, Order.access_token == token_uuid
    )
    if lock:
        query = query.with_for_update()
    order = query.first()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, ORDER_NOT_FOUND)
    return order


def mark_paid(db: Session, order: Order) -> bool:
    """Record that an online order has been paid. Safe to call more than once.

    Used by the PayRex webhook and by the confirmation page, whichever hears first.
    Returns True if this call changed anything.
    """
    if order.payment_status == "paid":
        return False

    order.payment_status = "paid"
    if order.order_status == "pending":
        order.order_status = "processing"  # ready for the owner to prepare
        if order.user_id is not None:
            # paid: take the ordered items out of their cart (unticked ones stay)
            remove_ordered_items(db, order.user_id, [item.product_id for item in order.items])
    elif order.order_status == "cancelled":
        # Rare: the money arrived after the order was cancelled (and restocked).
        # Leave a note so the owner sees it in the back office and can refund or restore it.
        note = "Paid online after this order was cancelled. Refund it in PayRex or restore the order."
        order.notes = f"{order.notes}\n{note}" if order.notes else note
    return True


def _delivery_fee(payload: OrderCreate) -> Decimal:
    """The real Lalamove price to the customer's pin (or the flat fee if Lalamove isn't set up)."""
    if payload.shipping_method != "delivery":
        return Decimal("0")
    if not lalamove.is_configured():
        return DELIVERY_FEE
    if payload.delivery_location is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Please drop a pin on the map so the rider can find you."
        )
    try:
        price = lalamove.quote(
            payload.delivery_location.lat,
            payload.delivery_location.lng,
            address_text(payload.shipping_address),
        )
    except lalamove.LalamoveError as exc:
        log.warning("Lalamove price check failed at checkout: %s (%s)", exc, exc.code)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST if exc.code else status.HTTP_502_BAD_GATEWAY,
            f"{exc} You can choose store pickup instead.",
        )
    return price["fee"]


def _remember_pin(db: Session, user: User, payload: OrderCreate) -> None:
    """Save the map pin with the customer's address, so checkout has it ready next time."""
    address, pin = payload.shipping_address, payload.delivery_location
    if address is None or pin is None:
        return
    saved = (
        db.query(Address)
        .filter(Address.user_id == user.user_id)
        .order_by(Address.is_default.desc(), Address.updated_at.desc())
        .first()
    )
    if saved is None:
        db.add(
            Address(
                user_id=user.user_id,
                recipient_name=payload.customer_name,
                phone=payload.phone,
                street=address.street,
                barangay=address.barangay,
                city=address.city,
                province=address.province,
                postal_code=address.postal_code,
                country=address.country,
                lat=pin.lat,
                lng=pin.lng,
                is_default=True,
            )
        )
    elif (saved.street, saved.city, saved.postal_code) == (address.street, address.city, address.postal_code):
        saved.lat, saved.lng = pin.lat, pin.lng  # same address: just remember the pin


def _cancel_and_restock(db: Session, order: Order) -> None:
    """Cancel an unpaid order and put its items back in stock."""
    order.order_status = "cancelled"
    for item in order.items:
        if item.product_id is not None:
            db.query(Product).filter(Product.product_id == item.product_id).update(
                {Product.stock_qty: Product.stock_qty + item.quantity}
            )


# ---------------------------------------------------------------------
# Place an order (cash on delivery or online payment)
# ---------------------------------------------------------------------
@router.post("/orders", response_model=OrderCreated, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),  # must be logged in
):
    # Ask Lalamove first, before holding any stock (it can take a few seconds).
    shipping_fee = _delivery_fee(payload)

    # Same product added twice? Add the quantities together.
    quantities: dict[int, int] = {}
    for item in payload.items:
        quantities[item.id] = quantities.get(item.id, 0) + item.quantity

    # Lock these product rows so two shoppers can't buy the last item at once.
    products = (
        db.query(Product)
        .filter(Product.product_id.in_(quantities), Product.is_active.is_(True))
        .with_for_update()
        .all()
    )
    products_by_id = {product.product_id: product for product in products}

    missing = [str(pid) for pid in quantities if pid not in products_by_id]
    if missing:
        db.rollback()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Some items in your cart are no longer available. Please remove them and try again.",
        )

    for product_id, quantity in quantities.items():
        product = products_by_id[product_id]
        if quantity > product.stock_qty:
            db.rollback()
            left = f"Only {product.stock_qty} left" if product.stock_qty > 0 else "Sold out"
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"{left} of {product.name}. Please update your cart."
            )

    # Prices always come from the database, never from the browser.
    subtotal = sum(
        (Decimal(products_by_id[pid].price) * qty for pid, qty in quantities.items()),
        Decimal("0"),
    )
    address = payload.shipping_address
    pin = payload.delivery_location

    order = Order(
        user_id=user.user_id,
        customer_name=payload.customer_name,
        email=payload.email,
        phone=payload.phone,
        shipping_method=payload.shipping_method,
        ship_street=address.street if address else None,
        ship_barangay=address.barangay if address else None,
        ship_city=address.city if address else None,
        ship_province=address.province if address else None,
        ship_postal_code=address.postal_code if address else None,
        ship_country=address.country if address else None,
        ship_lat=pin.lat if pin else None,
        ship_lng=pin.lng if pin else None,
        payment_method=payload.payment_method,
        subtotal=subtotal,
        shipping_fee=shipping_fee,
        total=subtotal + shipping_fee,
    )

    for product_id, quantity in quantities.items():
        product = products_by_id[product_id]
        order.items.append(
            OrderItem(
                product_id=product_id,
                product_name=product.name,
                unit_price=product.price,
                quantity=quantity,
            )
        )
        product.stock_qty -= quantity  # reserve the stock

    db.add(order)
    _remember_pin(db, user, payload)
    db.flush()  # the database fills in order_number and access_token here

    checkout_url = None
    if payload.payment_method == "online":
        payrex = _payrex()
        if payrex is None:
            db.rollback()
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Online payment isn't set up yet (PAYREX_API_SECRET is missing).",
            )

        success_url, cancel_url = _return_urls(order)
        line_items = [
            {"name": item.product_name, "amount": _centavos(Decimal(item.unit_price)),
             "quantity": item.quantity}
            for item in order.items
        ]
        if shipping_fee > 0:
            line_items.append(
                {"name": "Home delivery", "amount": _centavos(shipping_fee), "quantity": 1}
            )

        try:
            session = payrex.checkout_sessions.create(
                {
                    "currency": "PHP",
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                    "payment_methods": PAYREX_METHODS,
                    "line_items": line_items,
                    "description": f"La Crochet order {order.order_number}",
                    # PayRex copies this onto the payment, so its webhook can tell us
                    # which order was paid.
                    "metadata": {"order_number": order.order_number},
                }
            )
        except Exception as exc:
            db.rollback()
            reason = _payrex_reason(exc)
            log.error("PayRex refused to create the payment page: %s", reason)
            message = "PayRex could not start the payment. Please try again or choose cash on delivery."
            # With test keys, show PayRex's reason on the page too, to make fixing it easier.
            # Never with live keys: customers shouldn't see technical details.
            if os.getenv("PAYREX_API_SECRET", "").startswith("sk_test_"):
                message += f" (PayRex said: {reason})"
                if "403" in reason and "localhost" in success_url:
                    message += (
                        " Tip: PayRex blocks localhost addresses. Put PUBLIC_API_URL=<your ngrok address>"
                        " in backend/.env and restart the backend."
                    )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, message) from exc

        if not getattr(session, "url", None):
            db.rollback()
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "PayRex did not return a payment page.")

        order.payrex_checkout_session_id = session.id
        checkout_url = session.url
    else:
        # Cash on delivery / pay at pickup: the order is placed, so take the
        # ordered items out of the cart. Items they didn't tick stay for later.
        remove_ordered_items(db, user.user_id, quantities.keys())

    db.commit()

    return OrderCreated(
        order_number=order.order_number,
        access_token=str(order.access_token),
        checkout_url=checkout_url,
    )


# ---------------------------------------------------------------------
# "My Orders": every order placed by the logged-in customer, newest first
# ---------------------------------------------------------------------
@router.get("/orders", response_model=list[MyOrderOut])
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Order)
        .filter(Order.user_id == user.user_id)
        .order_by(Order.created_at.desc(), Order.order_id.desc())
        .all()
    )


# ---------------------------------------------------------------------
# Order confirmation page
# ---------------------------------------------------------------------
@router.get("/orders/{order_number}", response_model=OrderOut)
def get_order(order_number: str, token: str, db: Session = Depends(get_db)):
    order = _find_order(db, order_number, token, lock=True)

    # Online order not marked paid yet? Ask PayRex how the payment went.
    payrex = _payrex()
    if (
        payrex is not None
        and order.payment_method == "online"
        and order.payment_status == "unpaid"
        and order.order_status == "pending"
        and order.payrex_checkout_session_id
    ):
        try:
            session = payrex.checkout_sessions.retrieve(order.payrex_checkout_session_id)
            if session.status == "completed":
                mark_paid(db, order)
            elif session.status == "expired":
                _cancel_and_restock(db, order)
        except Exception:
            pass  # PayRex unreachable: show the order as it is, check again next time

    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------
# Customer pressed "back/cancel" on the PayRex page
# ---------------------------------------------------------------------
@router.post("/orders/{order_number}/cancel", response_model=OrderOut)
def cancel_unpaid_order(order_number: str, token: str, db: Session = Depends(get_db)):
    order = _find_order(db, order_number, token, lock=True)

    # Only unpaid online orders that haven't started can be cancelled this way.
    if (
        order.payment_method == "online"
        and order.payment_status == "unpaid"
        and order.order_status == "pending"
    ):
        payrex = _payrex()
        if payrex is not None and order.payrex_checkout_session_id:
            try:
                session = payrex.checkout_sessions.retrieve(order.payrex_checkout_session_id)
                if session.status == "completed":
                    # They actually paid — don't cancel.
                    mark_paid(db, order)
                    db.commit()
                    db.refresh(order)
                    return order
                if session.status == "active":
                    payrex.checkout_sessions.expire(order.payrex_checkout_session_id)
            except Exception:
                pass
        _cancel_and_restock(db, order)

    db.commit()
    db.refresh(order)
    return order
