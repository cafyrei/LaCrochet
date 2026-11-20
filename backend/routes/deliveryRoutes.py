"""Delivery prices for the checkout page (Lalamove)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

import lalamove_client as lalamove
from auth import get_current_user
from models.userModel import User
from schemas.orderSchemas import MapPin
from schemas.userSchemas import ShippingAddressIn

router = APIRouter()
log = logging.getLogger("uvicorn.error")


def address_text(address: ShippingAddressIn) -> str:
    """One line the rider can read: street, barangay, city, province and postal code."""
    parts = [address.street, address.barangay, address.city, f"{address.province} {address.postal_code}"]
    return ", ".join(part.strip() for part in parts if part and part.strip())


@router.get("/delivery/info")
def delivery_info():
    """Tells checkout whether Lalamove is set up, and where the shop is (to start the map nearby)."""
    if not lalamove.is_configured():
        from routes.orderRoutes import DELIVERY_FEE  # flat fee when Lalamove isn't set up

        return {"lalamove": False, "flat_fee": float(DELIVERY_FEE), "shop": None}
    return {"lalamove": True, "flat_fee": None, "shop": lalamove.shop_location()}


@router.post("/delivery/quote")
def delivery_quote(pin: MapPin, address: ShippingAddressIn, _: User = Depends(get_current_user)):
    """What a Lalamove rider costs to this pin right now (just for showing; the order asks again)."""
    if not lalamove.is_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Lalamove delivery isn't set up yet.")
    try:
        price = lalamove.quote(pin.lat, pin.lng, address_text(address))
    except lalamove.LalamoveError as exc:
        log.warning("Lalamove price check failed: %s (%s)", exc, exc.code)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST if exc.status == 422 or exc.code else status.HTTP_502_BAD_GATEWAY,
            str(exc),
        )
    return {"fee": float(price["fee"]), "distance_km": price["distance_km"]}
