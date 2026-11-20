"""Each logged-in customer's cart, saved in the database.

Prices and stock always come from the products table, so the cart is never
out of date.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models.cartModel import CartItem
from models.productModel import Product
from models.userModel import User

router = APIRouter()

MAX_QUANTITY = 99


class AddToCart(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1, le=MAX_QUANTITY)


class SetQuantity(BaseModel):
    quantity: int = Field(ge=1, le=MAX_QUANTITY)


class CartLine(BaseModel):
    product_id: int
    name: str
    image_url: str | None
    price: float
    quantity: int
    stock_qty: int
    available: bool          # false = hidden from the shop or sold out


class CartOut(BaseModel):
    items: list[CartLine]
    count: int               # total number of pieces
    subtotal: float          # only items that can still be bought


def _cart(db: Session, user: User) -> CartOut:
    rows = (
        db.query(CartItem)
        .join(Product)
        .filter(CartItem.user_id == user.user_id)
        .order_by(CartItem.created_at)
        .all()
    )
    items = [
        CartLine(
            product_id=row.product_id,
            name=row.product.name,
            image_url=row.product.image_url,
            price=float(row.product.price),
            quantity=row.quantity,
            stock_qty=row.product.stock_qty,
            available=bool(row.product.is_active) and row.product.stock_qty > 0,
        )
        for row in rows
    ]
    return CartOut(
        items=items,
        count=sum(item.quantity for item in items),
        subtotal=round(sum(item.price * item.quantity for item in items if item.available), 2),
    )


def _product_for_sale(db: Session, product_id: int) -> Product:
    product = (
        db.query(Product)
        .filter(Product.product_id == product_id, Product.is_active.is_(True))
        .first()
    )
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That product is no longer available.")
    return product


def _check_stock(product: Product, quantity: int) -> None:
    if quantity > product.stock_qty:
        if product.stock_qty <= 0:
            message = f"Sorry, {product.name} is sold out."
        else:
            message = f"Only {product.stock_qty} of {product.name} left in stock."
        raise HTTPException(status.HTTP_409_CONFLICT, message)


def clear_cart(db: Session, user_id: int) -> None:
    """Empty a customer's whole cart (the "Empty cart" button)."""
    db.query(CartItem).filter(CartItem.user_id == user_id).delete()


def remove_ordered_items(db: Session, user_id: int, product_ids) -> None:
    """After an order goes through, take only the ordered products out of the cart.

    Customers can tick which cart items to buy, so the unticked ones stay for later.
    """
    product_ids = [pid for pid in product_ids if pid is not None]
    if product_ids:
        db.query(CartItem).filter(
            CartItem.user_id == user_id, CartItem.product_id.in_(product_ids)
        ).delete(synchronize_session=False)


@router.get("/cart", response_model=CartOut)
def get_cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _cart(db, user)


@router.post("/cart/items", response_model=CartOut)
def add_to_cart(
    payload: AddToCart,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = _product_for_sale(db, payload.product_id)

    existing = db.get(CartItem, (user.user_id, payload.product_id))
    new_quantity = min(MAX_QUANTITY, (existing.quantity if existing else 0) + payload.quantity)
    _check_stock(product, new_quantity)

    # Add the row, or if it's already in the cart, raise its quantity.
    statement = insert(CartItem).values(
        user_id=user.user_id, product_id=payload.product_id, quantity=new_quantity
    )
    statement = statement.on_conflict_do_update(
        index_elements=[CartItem.user_id, CartItem.product_id],
        set_={"quantity": new_quantity},
    )
    db.execute(statement)
    db.commit()
    return _cart(db, user)


@router.put("/cart/items/{product_id}", response_model=CartOut)
def set_quantity(
    product_id: int,
    payload: SetQuantity,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.get(CartItem, (user.user_id, product_id))
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That item isn't in your cart.")

    # Lowering the quantity is always allowed; raising it needs stock.
    if payload.quantity > item.quantity:
        _check_stock(_product_for_sale(db, product_id), payload.quantity)

    item.quantity = payload.quantity
    db.commit()
    return _cart(db, user)


@router.delete("/cart/items/{product_id}", response_model=CartOut)
def remove_from_cart(
    product_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(CartItem).filter(
        CartItem.user_id == user.user_id, CartItem.product_id == product_id
    ).delete()
    db.commit()
    return _cart(db, user)


@router.delete("/cart", response_model=CartOut)
def empty_cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    clear_cart(db, user.user_id)
    db.commit()
    return _cart(db, user)
