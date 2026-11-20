"""The shop owner's tools. Every route here needs an account with role = admin."""

import logging
import re
from datetime import timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

import lalamove_client as lalamove
from auth import get_admin_user
from database import get_db
from models.categoryModel import Category
from models.orderModel import Order
from models.productModel import Product
from models.userModel import User
from routes.contactRoutes import count_new_messages
from routes.orderRoutes import _cancel_and_restock
from schemas.adminSchemas import (
    AdminCategoryOut,
    AdminOrderOut,
    AdminOrderWithRider,
    AdminProductOut,
    CategoryIn,
    CategoryOrder,
    CategoryUpdate,
    OrderUpdate,
    ProductIn,
    ProductUpdate,
)

router = APIRouter()
log = logging.getLogger("uvicorn.error")

LOW_STOCK = 5          # this many or fewer left = "running low"
SHOP_TIMEZONE = "Asia/Manila"

# Which status can follow which. Orders only move forward; "cancelled" and
# "completed" are final (a cancelled order's stock has already been returned).
NEXT_STATUSES = {
    "pending": {"processing", "cancelled"},
    "processing": {"ready_for_pickup", "shipped", "cancelled"},
    "ready_for_pickup": {"completed", "cancelled"},
    "shipped": {"completed"},
    "completed": set(),
    "cancelled": set(),
}


# ---------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------
@router.get("/orders", response_model=list[AdminOrderOut])
def all_orders(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return db.query(Order).order_by(Order.created_at.desc(), Order.order_id.desc()).all()


@router.patch("/orders/{order_number}", response_model=AdminOrderOut)
def update_order(
    order_number: str,
    payload: OrderUpdate,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order).filter(Order.order_number == order_number).with_for_update().first()
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")

    new_status = payload.order_status
    if new_status and new_status != order.order_status:
        if new_status not in NEXT_STATUSES[order.order_status]:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"An order that is {order.order_status.replace('_', ' ')} "
                f"can't be changed to {new_status.replace('_', ' ')}.",
            )
        if new_status == "ready_for_pickup" and order.shipping_method != "pickup":
            raise HTTPException(status.HTTP_409_CONFLICT, "This order is for delivery, not pickup.")
        if new_status == "shipped" and order.shipping_method != "delivery":
            raise HTTPException(status.HTTP_409_CONFLICT, "This order is for pickup, not delivery.")
        if (
            new_status == "processing"
            and order.payment_method == "online"
            and order.payment_status != "paid"
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Wait for the online payment to go through before preparing this order.",
            )

        if new_status == "cancelled":
            _cancel_and_restock(db, order)  # puts the items back in stock
        else:
            order.order_status = new_status

        # Cash on delivery / pay at pickup: completing it means the cash was collected.
        if new_status == "completed" and order.payment_method == "cod":
            order.payment_status = "paid"

    if payload.payment_status == "paid" and order.payment_status != "paid":
        if order.order_status == "cancelled":
            raise HTTPException(status.HTTP_409_CONFLICT, "This order was cancelled.")
        order.payment_status = "paid"

    db.commit()
    db.refresh(order)
    return order


# ---------------------------------------------------------------------
# Lalamove riders
# ---------------------------------------------------------------------
def _locked_order(db: Session, order_number: str) -> Order:
    order = db.query(Order).filter(Order.order_number == order_number).with_for_update().first()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return order


def _lalamove_failed(exc: "lalamove.LalamoveError") -> HTTPException:
    log.warning("Lalamove: %s (%s)", exc, exc.code)
    return HTTPException(status.HTTP_409_CONFLICT if exc.code else status.HTTP_502_BAD_GATEWAY, str(exc))


def _apply_lalamove_status(order: Order, info: dict) -> None:
    """Copy Lalamove's latest news onto the order, and move the order along with the rider."""
    order.lalamove_status = info.get("status") or order.lalamove_status
    order.lalamove_share_link = info.get("share_link") or order.lalamove_share_link
    order.lalamove_driver_id = info.get("driver_id") or order.lalamove_driver_id

    if order.lalamove_status == "PICKED_UP" and order.order_status == "processing":
        order.order_status = "shipped"     # the rider has the parcel: "On the way"
    elif order.lalamove_status == "COMPLETED" and order.order_status in ("processing", "shipped"):
        order.order_status = "completed"   # delivered (cash on delivery: mark it paid when you have the cash)


@router.post("/orders/{order_number}/lalamove", response_model=AdminOrderWithRider)
def book_rider(order_number: str, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """The "Book Lalamove rider" button."""
    if not lalamove.is_configured():
        raise HTTPException(status.HTTP_409_CONFLICT, "Lalamove isn't set up yet. Add the Lalamove keys and SHOP_LAT/SHOP_LNG to backend/.env.")

    order = _locked_order(db, order_number)  # locked, so a double-click can't book two riders
    if order.shipping_method != "delivery":
        raise HTTPException(status.HTTP_409_CONFLICT, "This order is for pickup, not delivery.")
    if order.order_status != "processing":
        raise HTTPException(status.HTTP_409_CONFLICT, "Book a rider once the order is being prepared (and paid, if paying online).")
    if order.lalamove_order_id and order.lalamove_status not in lalamove.FINISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "A rider is already booked for this order.")
    if order.ship_lat is None or order.ship_lng is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This order has no map pin (it was placed before Lalamove was connected). Book it in the Lalamove app.",
        )

    address = ", ".join(
        part for part in (order.ship_street, order.ship_barangay, order.ship_city,
                          f"{order.ship_province or ''} {order.ship_postal_code or ''}".strip()) if part
    )
    try:
        booking = lalamove.book(
            lat=order.ship_lat, lng=order.ship_lng, address=address,
            customer_name=order.customer_name, customer_phone=order.phone, order_number=order.order_number,
        )
    except lalamove.LalamoveError as exc:
        db.rollback()
        raise _lalamove_failed(exc)

    order.lalamove_order_id = booking["order_id"]
    order.lalamove_fee = booking["fee"]
    order.lalamove_driver_id = None
    _apply_lalamove_status(order, booking)

    # Prices can move between checkout and booking: leave a note if you paid more than the customer did.
    charged = Decimal(order.shipping_fee or 0)
    if booking["fee"] > charged:
        note = f"Lalamove charged ₱{booking['fee']:,.2f} for the rider; the customer paid ₱{charged:,.2f} for delivery."
        order.notes = f"{order.notes}\n{note}" if order.notes else note

    db.commit()
    db.refresh(order)
    return {"order": order, "rider": None}


@router.post("/orders/{order_number}/lalamove/refresh", response_model=AdminOrderWithRider)
def refresh_rider(order_number: str, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Ask Lalamove where the rider is now (the panel does this when you open an order)."""
    order = _locked_order(db, order_number)
    if not order.lalamove_order_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "No rider has been booked for this order.")
    try:
        info = lalamove.get_order(order.lalamove_order_id)
    except lalamove.LalamoveError as exc:
        db.rollback()
        raise _lalamove_failed(exc)

    _apply_lalamove_status(order, info)
    rider = None
    if order.lalamove_driver_id and order.lalamove_status not in lalamove.FINISHED:
        rider = lalamove.get_driver(order.lalamove_order_id, order.lalamove_driver_id)

    db.commit()
    db.refresh(order)
    return {"order": order, "rider": rider}


@router.delete("/orders/{order_number}/lalamove", response_model=AdminOrderWithRider)
def cancel_rider(order_number: str, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Cancel the booked rider (Lalamove allows this until 5 minutes after a rider is assigned)."""
    order = _locked_order(db, order_number)
    if not order.lalamove_order_id or order.lalamove_status in lalamove.FINISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "There's no active rider booking to cancel.")
    try:
        lalamove.cancel(order.lalamove_order_id)
    except lalamove.LalamoveError as exc:
        db.rollback()
        raise _lalamove_failed(exc)

    order.lalamove_status = "CANCELED"
    if order.order_status == "shipped":
        order.order_status = "processing"   # back to "Preparing" so you can book again
    db.commit()
    db.refresh(order)
    return {"order": order, "rider": None}


# ---------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------
def _slugify(name: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or fallback


def _unique_slug(db: Session, id_column, name: str, own_id: int | None = None, max_length: int = 150) -> str:
    """A link-friendly name ("Crochet Kits" -> "crochet-kits") that no other row uses.

    id_column is Product.product_id or Category.category_id, which tells us the table.
    """
    model = id_column.class_
    base = _slugify(name, model.__tablename__.rstrip("s"))[: max_length - 4]
    slug, number = base, 2
    while True:
        query = db.query(model).filter(model.slug == slug)
        if own_id is not None:
            query = query.filter(id_column != own_id)
        if query.first() is None:
            return slug
        slug, number = f"{base}-{number}", number + 1


def _check_category(db: Session, category_id: int | None) -> None:
    if category_id is not None and db.get(Category, category_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That category doesn't exist.")


@router.get("/products", response_model=list[AdminProductOut])
def all_products(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Every product, including ones switched off."""
    return db.query(Product).order_by(Product.product_id).all()


@router.post("/products", response_model=AdminProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductIn,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    _check_category(db, payload.category_id)
    product = Product(**payload.model_dump(), slug=_unique_slug(db, Product.product_id, payload.name))
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.patch("/products/{product_id}", response_model=AdminProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

    changes = payload.model_dump(exclude_unset=True)
    # These can't be empty; ignore them if they were sent as blank.
    for field in ("name", "description", "price", "stock_qty", "is_active", "is_featured"):
        if field in changes and changes[field] is None:
            changes.pop(field)
    if "category_id" in changes:
        _check_category(db, changes["category_id"])
    if "image_url" in changes:
        changes["image_url"] = (changes["image_url"] or "").strip() or None
    if changes.get("name"):
        changes["name"] = changes["name"].strip()
        changes["slug"] = _unique_slug(db, Product.product_id, changes["name"], product_id)

    for field, value in changes.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    return product


# ---------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------
def _to_do_counts(db: Session) -> dict:
    """How many things are waiting for the owner right now."""
    row = db.execute(
        text(
            """
            select
              count(*) filter (where order_status = 'pending'
                               and not (payment_method = 'online' and payment_status <> 'paid')) as to_prepare,
              count(*) filter (where order_status = 'pending'
                               and payment_method = 'online' and payment_status <> 'paid')       as awaiting_payment,
              count(*) filter (where order_status = 'processing')                                as preparing,
              count(*) filter (where order_status in ('ready_for_pickup', 'shipped'))            as with_customer
            from orders
            """
        )
    ).mappings().one()
    low_stock = (
        db.query(func.count(Product.product_id))
        .filter(Product.is_active.is_(True), Product.stock_qty <= LOW_STOCK)
        .scalar()
    )
    return {**row, "low_stock": low_stock}


@router.get("/counts")
def sidebar_counts(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """The little numbers next to Orders, Products and Messages in the side menu."""
    counts = _to_do_counts(db)
    return {
        "orders": counts["to_prepare"] + counts["preparing"],
        "low_stock": counts["low_stock"],
        "messages": count_new_messages(db),
    }


@router.get("/dashboard")
def dashboard(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Everything on the back-office home screen, in one trip to the server."""
    today = db.execute(
        text("select (now() at time zone :tz)::date"), {"tz": SHOP_TIMEZONE}
    ).scalar_one()

    # Sales per day (shop's time zone), cancelled orders don't count.
    per_day = {
        row.day: row
        for row in db.execute(
            text(
                """
                select (created_at at time zone :tz)::date as day,
                       count(*)                            as orders,
                       coalesce(sum(total), 0)             as sales
                from orders
                where order_status <> 'cancelled'
                  and created_at >= now() - interval '40 days'
                group by 1
                """
            ),
            {"tz": SHOP_TIMEZONE},
        )
    }

    def total(days):
        rows = [per_day[day] for day in days if day in per_day]
        return {"sales": float(sum(r.sales for r in rows)), "orders": sum(r.orders for r in rows)}

    last_7 = [today - timedelta(days=n) for n in range(7)]
    this_month = [today - timedelta(days=n) for n in range(today.day)]
    last_14 = [today - timedelta(days=n) for n in range(13, -1, -1)]

    best_sellers = db.execute(
        text(
            """
            select oi.product_id, oi.product_name as name,
                   sum(oi.quantity)   as sold,
                   sum(oi.line_total) as sales
            from order_items oi
            join orders o on o.order_id = oi.order_id
            where o.order_status <> 'cancelled'
              and o.created_at >= now() - interval '30 days'
            group by oi.product_id, oi.product_name
            order by sold desc, sales desc
            limit 5
            """
        )
    ).mappings().all()

    low_stock = (
        db.query(Product)
        .filter(Product.is_active.is_(True), Product.stock_qty <= LOW_STOCK)
        .order_by(Product.stock_qty, Product.name)
        .limit(6)
        .all()
    )

    recent = db.query(Order).order_by(Order.created_at.desc(), Order.order_id.desc()).limit(6).all()

    return {
        "to_do": _to_do_counts(db),
        "sales": {
            "today": total([today]),
            "last_7_days": total(last_7),
            "this_month": total(this_month),
        },
        "daily": [
            {"date": day.isoformat(), **total([day])}
            for day in last_14
        ],
        "best_sellers": [
            {**row, "sold": int(row["sold"]), "sales": float(row["sales"])} for row in best_sellers
        ],
        "low_stock": [
            {"product_id": p.product_id, "name": p.name, "stock_qty": p.stock_qty, "image_url": p.image_url}
            for p in low_stock
        ],
        "recent_orders": [
            {
                "order_number": o.order_number,
                "customer_name": o.customer_name,
                "total": float(o.total),
                "order_status": o.order_status,
                "payment_method": o.payment_method,
                "payment_status": o.payment_status,
                "shipping_method": o.shipping_method,
                "created_at": o.created_at,
            }
            for o in recent
        ],
    }


# ---------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------
def _category_out(db: Session, categories: list[Category]) -> list[dict]:
    counts = {
        row.category_id: row
        for row in db.query(
            Product.category_id,
            func.count(Product.product_id).label("all"),
            func.count(Product.product_id).filter(Product.is_active.is_(True)).label("on_sale"),
        ).group_by(Product.category_id)
    }
    return [
        {
            "category_id": c.category_id,
            "name": c.name,
            "slug": c.slug,
            "description": c.description,
            "sort_order": c.sort_order,
            "product_count": counts[c.category_id].all if c.category_id in counts else 0,
            "on_sale_count": counts[c.category_id].on_sale if c.category_id in counts else 0,
        }
        for c in categories
    ]


def _check_category_name(db: Session, name: str, own_id: int | None = None) -> None:
    query = db.query(Category).filter(func.lower(Category.name) == name.lower())
    if own_id is not None:
        query = query.filter(Category.category_id != own_id)
    if query.first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "There's already a category with that name.")


@router.get("/categories", response_model=list[AdminCategoryOut])
def all_categories(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return _category_out(db, db.query(Category).order_by(Category.sort_order, Category.name).all())


@router.post("/categories", response_model=AdminCategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryIn, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    _check_category_name(db, payload.name)
    last = db.query(func.max(Category.sort_order)).scalar()
    category = Category(
        name=payload.name,
        description=payload.description,
        slug=_unique_slug(db, Category.category_id, payload.name, max_length=100),
        sort_order=(last or 0) + 1,   # new ones go at the end
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return _category_out(db, [category])[0]


@router.patch("/categories/{category_id}", response_model=AdminCategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found.")

    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name"):
        _check_category_name(db, changes["name"], category_id)
        category.name = changes["name"]
        category.slug = _unique_slug(db, Category.category_id, changes["name"], category_id, max_length=100)
    if "description" in changes:
        category.description = changes["description"]

    db.commit()
    db.refresh(category)
    return _category_out(db, [category])[0]


@router.put("/categories/order", response_model=list[AdminCategoryOut])
def reorder_categories(payload: CategoryOrder, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Save the order the categories appear in on the shop."""
    categories = {c.category_id: c for c in db.query(Category).all()}
    if sorted(payload.category_ids) != sorted(categories):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The categories changed while you were sorting. Refresh the page and try again.",
        )
    for position, category_id in enumerate(payload.category_ids, start=1):
        categories[category_id].sort_order = position
    db.commit()
    return all_categories(_, db)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Products inside it are kept; they just end up with no category."""
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found.")
    db.delete(category)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------
# Newsletter
# ---------------------------------------------------------------------
@router.get("/newsletter")
def newsletter_subscribers(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Everyone who used the footer "Join" form, newest first."""
    return db.execute(
        text(
            """
            select subscriber_id, email, subscribed_at, unsubscribed_at
            from newsletter_subscribers
            order by subscribed_at desc, subscriber_id desc
            """
        )
    ).mappings().all()


@router.delete("/newsletter/{subscriber_id}")
def unsubscribe(subscriber_id: int, _: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Stop emailing this person. They stay on the list, marked as unsubscribed."""
    row = db.execute(
        text(
            """
            update newsletter_subscribers
            set unsubscribed_at = coalesce(unsubscribed_at, now())
            where subscriber_id = :id
            returning subscriber_id, email, subscribed_at, unsubscribed_at
            """
        ),
        {"id": subscriber_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subscriber not found.")
    db.commit()
    return row
