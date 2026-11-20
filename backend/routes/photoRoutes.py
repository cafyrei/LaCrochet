"""Product photo uploads for the back office (drag and drop, or "Choose a photo").

The photo is saved in backend/uploads/products/ under a random name, and the
backend serves it at /uploads/products/<name>. The product keeps that short
address in image_url, and the website adds the backend's address in front.
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status

from auth import get_admin_user
from models.userModel import User

router = APIRouter()

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
PRODUCT_PHOTOS = UPLOAD_ROOT / "products"
MAX_BYTES = 5 * 1024 * 1024   # 5 MB is plenty for a product photo


def _kind_of(data: bytes) -> str | None:
    """What the file really is, read from its first bytes (not from its name)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


@router.post("/uploads/product-photo", status_code=status.HTTP_201_CREATED)
async def upload_product_photo(request: Request, _: User = Depends(get_admin_user)):
    """The photo itself is the request body. Answers {"image_url": "/uploads/products/..."}."""
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "That photo is over 5 MB. Please use a smaller one.")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No photo was received. Please try again.")

    kind = _kind_of(bytes(data[:16]))
    if kind is None:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Please use a JPG, PNG, WebP or GIF photo.")

    PRODUCT_PHOTOS.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{kind}"   # random name: no clashes, nothing guessable from the original
    (PRODUCT_PHOTOS / name).write_bytes(data)
    print(f"/uploads/products/{name}")
    return {"image_url": f"/uploads/products/{name}"}
