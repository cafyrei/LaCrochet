import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schemas.userSchemas import EMAIL_PATTERN, PHONE_PATTERN, ShippingAddressIn, _text


class OrderItemIn(BaseModel):
    id: int                                   # product_id
    quantity: int = Field(ge=1, le=99)


class MapPin(BaseModel):
    """A spot on the map. The bounds are roughly the Philippines."""

    lat: float = Field(ge=4.0, le=21.5)
    lng: float = Field(ge=116.0, le=127.5)


class OrderCreate(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1, max_length=50)
    customer_name: _text(200)
    email: str = Field(max_length=255)
    phone: str
    shipping_method: Literal["delivery", "pickup"]
    payment_method: Literal["cod", "online"]
    shipping_address: Optional[ShippingAddressIn] = None
    delivery_location: Optional[MapPin] = None    # the customer's pin, for Lalamove

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_PATTERN.match(value):
            raise ValueError("Please enter a valid email address.")
        return value

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: str) -> str:
        value = value.strip()
        if not PHONE_PATTERN.match(value):
            raise ValueError("Please enter a valid mobile number.")
        return value

    @model_validator(mode="after")
    def delivery_needs_address(self):
        if self.shipping_method == "delivery" and self.shipping_address is None:
            raise ValueError("Please enter a delivery address.")
        if self.shipping_method == "pickup":
            self.shipping_address = None  # pickup orders don't store an address
            self.delivery_location = None
        return self


class OrderCreated(BaseModel):
    order_number: str
    access_token: str
    checkout_url: Optional[str] = None        # only for online payment


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: Optional[int]
    product_name: str
    unit_price: float
    quantity: int
    line_total: float


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_number: str
    customer_name: str
    email: str
    phone: str
    shipping_method: str
    ship_street: Optional[str]
    ship_barangay: Optional[str]
    ship_city: Optional[str]
    ship_province: Optional[str]
    ship_postal_code: Optional[str]
    payment_method: str
    payment_status: str
    order_status: str
    subtotal: float
    shipping_fee: float
    total: float
    created_at: datetime
    items: list[OrderItemOut]
    lalamove_status: Optional[str] = None
    lalamove_share_link: Optional[str] = None   # "Track your rider" link


class MyOrderOut(OrderOut):
    """An order in the customer's "My Orders" list (includes its secret link)."""

    access_token: uuid.UUID
