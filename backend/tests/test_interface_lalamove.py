"""INTERFACE tests: the shapes the checkout map and the owner's rider panel rely on."""

import pytest

from main import app
from tests.conftest import ADDRESS, PIN, order_body

pytestmark = pytest.mark.interface

DELIVERY_PATHS = {
    ("get", "/api/delivery/info"),
    ("post", "/api/delivery/quote"),
    ("post", "/api/admin/orders/{order_number}/lalamove"),
    ("post", "/api/admin/orders/{order_number}/lalamove/refresh"),
    ("delete", "/api/admin/orders/{order_number}/lalamove"),
}


def test_delivery_routes_exist():
    paths = app.openapi()["paths"]
    for method, path in DELIVERY_PATHS:
        assert method in paths.get(path, {}), f"{method.upper()} {path} is missing"


def test_delivery_info_shape(client, lalamove):
    info = client.get("/api/delivery/info").json()
    assert set(info) == {"lalamove", "flat_fee", "shop"}
    assert set(info["shop"]) == {"lat", "lng"}


def test_quote_shape(client, clean_db, customer, lalamove):
    r = client.post("/api/delivery/quote", headers=customer, json={"pin": PIN, "address": ADDRESS})
    assert set(r.json()) == {"fee", "distance_km"}
    assert isinstance(r.json()["fee"], (int, float))


def test_quote_needs_both_pin_and_address(client, customer, lalamove):
    r = client.post("/api/delivery/quote", headers=customer, json={"pin": PIN})
    assert r.status_code == 422


def test_rider_panel_shape(client, clean_db, customer, owner, lalamove):
    number = client.post("/api/orders", headers=customer, json=order_body(
        shipping_method="delivery", delivery_location=PIN)).json()["order_number"]
    client.patch(f"/api/admin/orders/{number}", headers=owner, json={"order_status": "processing"})
    booked = client.post(f"/api/admin/orders/{number}/lalamove", headers=owner).json()
    assert set(booked) == {"order", "rider"}
    for key in ("order_number", "order_status", "lalamove_status", "lalamove_share_link",
                "lalamove_fee", "lalamove_order_id", "ship_lat", "ship_lng"):
        assert key in booked["order"], key

    lalamove.set_status(booked["order"]["lalamove_order_id"], "ON_GOING")
    seen = client.post(f"/api/admin/orders/{number}/lalamove/refresh", headers=owner).json()
    assert set(seen["rider"]) == {"name", "phone", "plate_number"}


def test_rider_errors_are_readable(client, clean_db, customer, owner, lalamove):
    number = client.post("/api/orders", headers=customer, json=order_body()).json()["order_number"]
    r = client.post(f"/api/admin/orders/{number}/lalamove", headers=owner)
    assert r.status_code == 409 and isinstance(r.json()["detail"], str)
