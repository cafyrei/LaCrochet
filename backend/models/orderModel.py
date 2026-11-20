from sqlalchemy import (
    Column, Computed, DateTime, FetchedValue, ForeignKey, Integer, Numeric, String, Text, func
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from database import Base


class Order(Base):
    __tablename__ = "orders"

    order_id = Column(Integer, primary_key=True)
    # Filled in by the database: LC-2026-0001, LC-2026-0002, ...
    order_number = Column(String(20), unique=True, nullable=False, server_default=FetchedValue())
    user_id = Column(
        Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True  # NULL = guest
    )
    # Random secret used in the confirmation link (made by the database).
    access_token = Column(UUID(as_uuid=True), unique=True, nullable=False, server_default=FetchedValue())

    customer_name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)

    shipping_method = Column(String(20), nullable=False)  # delivery | pickup
    ship_street = Column(String(255))
    ship_barangay = Column(String(100))
    ship_city = Column(String(100))
    ship_province = Column(String(100))
    ship_postal_code = Column(String(10))
    ship_country = Column(String(100), server_default="Philippines")
    ship_lat = Column(Numeric(9, 6))   # customer's map pin, for Lalamove
    ship_lng = Column(Numeric(9, 6))

    payment_method = Column(String(20), nullable=False)  # cod | online
    payment_status = Column(String(20), nullable=False, server_default="unpaid")
    order_status = Column(String(20), nullable=False, server_default="pending")

    subtotal = Column(Numeric(10, 2), nullable=False)
    shipping_fee = Column(Numeric(10, 2), nullable=False, server_default="0")
    total = Column(Numeric(10, 2), nullable=False)

    payrex_checkout_session_id = Column(String(100), unique=True)
    lalamove_order_id = Column(String(100))
    lalamove_status = Column(String(30))
    lalamove_share_link = Column(String(500))
    lalamove_fee = Column(Numeric(10, 2))
    lalamove_driver_id = Column(String(50))

    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    order_item_id = Column(Integer, primary_key=True)
    order_id = Column(
        Integer, ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id = Column(
        Integer, ForeignKey("products.product_id", ondelete="SET NULL"), nullable=True
    )
    product_name = Column(String(150), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False)
    # Worked out by the database (unit_price × quantity).
    line_total = Column(Numeric(10, 2), Computed("unit_price * quantity"))

    order = relationship("Order", back_populates="items")
