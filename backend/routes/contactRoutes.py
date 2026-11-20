"""The Contact page: shop details, the message form, and the owner's Messages inbox."""

import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from auth import get_admin_user, get_optional_user
from database import get_db
from models.contactModel import ContactMessage
from models.userModel import User
from schemas.userSchemas import EMAIL_PATTERN, PHONE_PATTERN

router = APIRouter()

ORDER_NUMBER = re.compile(r"^LC-\d{4}-\d+$")
MESSAGES_PER_HOUR = 5  # per person, so the form can't be used to flood the inbox


# ---------------------------------------------------------------------
# Shop details (from backend/.env, so they're typed in one place)
# ---------------------------------------------------------------------
def _setting(name: str) -> Optional[str]:
    value = os.getenv(name, "").strip()
    return value or None


@router.get("/shop/info")
def shop_info():
    """What the Contact page shows. Anything not set in .env is left out."""
    return {
        "name": _setting("SHOP_NAME") or "La Crochet",
        "phone": _setting("SHOP_PHONE"),
        "email": _setting("SHOP_EMAIL"),
        "address": _setting("SHOP_ADDRESS"),
        "hours": _setting("SHOP_HOURS"),
        "facebook": _setting("SHOP_FACEBOOK"),
        "instagram": _setting("SHOP_INSTAGRAM"),
    }


# ---------------------------------------------------------------------
# Sending a message
# ---------------------------------------------------------------------
class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    topic: Literal["order", "custom", "product", "other"]
    order_number: Optional[str] = Field(default=None, max_length=20)
    message: str = Field(min_length=1, max_length=2000)
    # A hidden box real people never see. Spam robots fill in every box, so
    # if this has anything in it, the message is quietly thrown away.
    website: Optional[str] = None

    @field_validator("name", "message")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Please fill this in.")
        return value

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
        value = (value or "").strip()
        if not value:
            return None
        if not PHONE_PATTERN.match(value):
            raise ValueError("Please enter a valid mobile number, like 0917 123 4567.")
        return value

    @field_validator("order_number")
    @classmethod
    def check_order_number(cls, value: Optional[str]) -> Optional[str]:
        value = (value or "").strip().upper()
        if not value:
            return None
        if not ORDER_NUMBER.match(value):
            raise ValueError("Order numbers look like LC-2026-0012.")
        return value


_sent: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _check_limit(key: str) -> None:
    now = time.monotonic()
    with _lock:
        times = _sent[key]
        while times and now - times[0] > 3600:
            times.popleft()
        if len(times) >= MESSAGES_PER_HOUR:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "You've sent a few messages already. We'll reply soon, or try again in an hour.",
            )
        times.append(now)


@router.post("/contact", status_code=status.HTTP_201_CREATED)
def send_message(
    payload: ContactIn,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    if payload.website:
        return {"sent": True}  # a robot: pretend it worked, save nothing

    key = f"user:{user.user_id}" if user else f"ip:{request.client.host if request.client else 'unknown'}"
    _check_limit(key)

    db.add(
        ContactMessage(
            user_id=user.user_id if user else None,
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            topic=payload.topic,
            order_number=payload.order_number if payload.topic == "order" else None,
            message=payload.message,
        )
    )
    db.commit()
    return {"sent": True}


# ---------------------------------------------------------------------
# The owner's inbox (back office → Messages)
# ---------------------------------------------------------------------
class MessageOut(BaseModel):
    message_id: int
    name: str
    email: str
    phone: Optional[str]
    topic: str
    order_number: Optional[str]
    message: str
    status: str
    created_at: datetime
    has_account: bool


class MessageStatusIn(BaseModel):
    status: Literal["new", "read", "replied"]


def _out(item: ContactMessage) -> MessageOut:
    return MessageOut(
        message_id=item.message_id,
        name=item.name,
        email=item.email,
        phone=item.phone,
        topic=item.topic,
        order_number=item.order_number,
        message=item.message,
        status=item.status,
        created_at=item.created_at,
        has_account=item.user_id is not None,
    )


@router.get("/admin/messages", response_model=list[MessageOut])
def list_messages(_: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Newest first. The page filters New / Read / Replied itself."""
    rows = db.query(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(500).all()
    return [_out(row) for row in rows]


@router.patch("/admin/messages/{message_id}", response_model=MessageOut)
def set_message_status(
    message_id: int,
    payload: MessageStatusIn,
    _: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    item = db.get(ContactMessage, message_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That message was not found.")
    item.status = payload.status
    db.commit()
    return _out(item)


def count_new_messages(db: Session) -> int:
    """For the badge next to Messages in the back-office menu."""
    return db.query(ContactMessage).filter(ContactMessage.status == "new").count()
