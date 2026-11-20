from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from schemas.orderSchemas import OrderOut

OrderStatus = Literal["pending", "processing", "ready_for_pickup", "shipped", "completed", "cancelled"]


class AdminOrderOut(OrderOut):
    order_id: int
    user_id: Optional[int]
    notes: Optional[str]
    updated_at: datetime
    ship_lat: Optional[float] = None
    ship_lng: Optional[float] = None
    lalamove_order_id: Optional[str] = None
    lalamove_fee: Optional[float] = None
    lalamove_driver_id: Optional[str] = None


class RiderInfo(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    plate_number: Optional[str] = None


class AdminOrderWithRider(BaseModel):
    """An order plus its Lalamove rider (when Lalamove shares the rider's details)."""

    order: AdminOrderOut
    rider: Optional[RiderInfo] = None


class OrderUpdate(BaseModel):
    """What the owner can change on an order. Send only what changes."""

    order_status: Optional[OrderStatus] = None
    payment_status: Optional[Literal["paid"]] = None   # e.g. cash was collected


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=2000)
    price: float = Field(gt=0, le=1_000_000)
    category_id: Optional[int] = None
    stock_qty: int = Field(ge=0, le=100_000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True
    is_featured: bool = False

    @field_validator("name", "description")
    @classmethod
    def strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("image_url")
    @classmethod
    def blank_is_none(cls, value: Optional[str]) -> Optional[str]:
        value = (value or "").strip()
        return value or None


class ProductUpdate(BaseModel):
    """Partial update: e.g. just the stock, or just switching a product off."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    price: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    category_id: Optional[int] = None
    stock_qty: Optional[int] = Field(default=None, ge=0, le=100_000)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


class AdminProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int
    category_id: Optional[int]
    name: str
    slug: str
    description: str
    price: float
    image_url: Optional[str]
    stock_qty: int
    is_active: bool
    is_featured: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------
def _clean_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError("Please enter a name.")
    return value


def _blank_is_none(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: Optional[str]) -> Optional[str]:
        return _clean_name(value)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: Optional[str]) -> Optional[str]:
        return _blank_is_none(value)


class CategoryUpdate(CategoryIn):
    """Send only what changes."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)


class CategoryOrder(BaseModel):
    """Every category id, in the order they should appear in the shop."""

    category_ids: list[int]


class AdminCategoryOut(BaseModel):
    category_id: int
    name: str
    slug: str
    description: Optional[str]
    sort_order: int
    product_count: int    # every product in it, hidden ones too
    on_sale_count: int    # only the ones customers can see
