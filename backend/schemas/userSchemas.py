import re
from datetime import datetime
from typing import Annotated, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_PATTERN = re.compile(r"^[0-9+\-()\s]{7,20}$")


def _text(max_length: int):
    """A required string, trimmed, at least one character."""
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)
    ]


class ShippingAddressIn(BaseModel):
    street: _text(255)
    barangay: _text(100)
    city: _text(100)
    province: _text(100)
    postal_code: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4}$")]
    country: _text(100) = "Philippines"


class UserRegister(BaseModel):
    first_name: _text(100)
    last_name: _text(100)
    email: str = Field(max_length=255)
    # Passwords are deliberately NOT trimmed.
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = None
    accept_terms: bool
    marketing_opt_in: bool = False
    shipping_address: Optional[ShippingAddressIn] = None

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_PATTERN.match(value):
            raise ValueError("Please enter a valid email address.")
        return value

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not PHONE_PATTERN.match(value):
            raise ValueError("Please enter a valid mobile number.")
        return value

    @field_validator("accept_terms")
    @classmethod
    def check_terms(cls, value: bool) -> bool:
        if not value:
            raise ValueError("You must accept the Terms of Service to create an account.")
        return value

    @model_validator(mode="after")
    def address_needs_phone(self):
        # addresses.phone is NOT NULL, and couriers need a contact number anyway.
        if self.shipping_address is not None and self.phone is None:
            raise ValueError("A mobile number is required when adding a shipping address.")
        return self


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=128)
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    street: str
    barangay: str
    city: str
    province: str
    postal_code: str
    country: str
    lat: Optional[float] = None
    lng: Optional[float] = None


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    first_name: str
    last_name: str
    email: str
    phone: Optional[str]
    role: str
    default_address: Optional[AddressOut] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserProfile


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    first_name: str
    last_name: str
    email: str
