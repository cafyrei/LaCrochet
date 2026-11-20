"""INTEGRATION tests: delivery with Lalamove, start to finish.

Real backend + test database + the Lalamove stand-in: price check at checkout,
the owner booking a rider, following the rider, and cancelling.
"""

import pytest

from tests.conftest import ADDRESS, PIN, order_body, sql

pytestmark = pytest.mark.integration


def delivery_order(client, customer, **changes):
    body = order_body(shipping_method="delivery", delivery_location=PIN, **changes)
    r = client.post("/api/orders", headers=customer, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def prepared(client, owner, number):
    r = client.patch(f"/api/admin/orders/{number}", headers=owner, json={"order_status": "processing"})
    assert r.status_code == 200, r.text


def book(client, owner, number):
    return client.post(f"/api/admin/orders/{number}/lalamove", headers=owner)


# ---- checkout side ----
def test_delivery_info_says_lalamove_is_on(client, lalamove):
    info = client.get("/api/delivery/info").json()
    assert info["lalamove"] is True and info["shop"] == {"lat": 14.676, "lng": 121.0437}


def test_delivery_info_falls_back_to_flat_fee(client, monkeypatch):
    monkeypatch.setenv("LALAMOVE_API_SECRET", "")
    assert client.get("/api/delivery/info").json() == {"lalamove": False, "flat_fee": 90.0, "shop": None}


def test_price_check_shows_fee_and_distance(client, clean_db, customer, lalamove):
    r = client.post("/api/delivery/quote", headers=customer, json={"pin": PIN, "address": ADDRESS})
    assert r.status_code == 200
    fee, km = r.json()["fee"], r.json()["distance_km"]
    assert km == pytest.approx(3.2, abs=0.2)
    assert fee == round(49 + 7 * lalamove.last_km)


def test_price_check_outside_service_area(client, clean_db, customer, lalamove):
    r = client.post("/api/delivery/quote", headers=customer,
                    json={"pin": {"lat": 19.5, "lng": 121.0}, "address": ADDRESS})
    assert r.status_code == 400 and "doesn't deliver to that spot" in r.json()["detail"]


def test_price_check_needs_login(client, lalamove):
    r = client.post("/api/delivery/quote", json={"pin": PIN, "address": ADDRESS})
    assert r.status_code == 401


def test_delivery_order_needs_a_pin(client, clean_db, customer, lalamove):
    r = client.post("/api/orders", headers=customer, json=order_body(shipping_method="delivery"))
    assert r.status_code == 400 and "drop a pin" in r.json()["detail"]


def test_delivery_order_charges_lalamove_price_and_remembers_pin(client, clean_db, customer, lalamove):
    placed = delivery_order(client, customer)
    quoted = float(next(iter(lalamove.quotes.values()))["priceBreakdown"]["total"])
    fee, subtotal, total = sql(clean_db, "select shipping_fee, subtotal, total from orders where order_number = :n",
                               n=placed["order_number"])[0]
    assert float(fee) == quoted and float(total) == float(subtotal) + quoted
    lat, lng = sql(clean_db, "select lat, lng from addresses where street = :s", s=ADDRESS["street"])[0]
    assert (float(lat), float(lng)) == (PIN["lat"], PIN["lng"])


def test_lalamove_down_at_checkout_suggests_pickup(client, clean_db, customer, lalamove, http):
    http.network_down.add("rest.sandbox.lalamove.com")
    r = client.post("/api/orders", headers=customer,
                    json=order_body(shipping_method="delivery", delivery_location=PIN))
    assert r.status_code == 502 and "choose store pickup" in r.json()["detail"]
    assert sql(clean_db, "select count(*) from orders")[0][0] == 0


# ---- the owner's side ----
def test_rider_can_only_be_booked_once_order_is_prepared(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    r = book(client, owner, placed["order_number"])
    assert r.status_code == 409 and "being prepared" in r.json()["detail"]
    assert lalamove.orders == {}


def test_book_rider_saves_the_booking(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    prepared(client, owner, placed["order_number"])
    r = book(client, owner, placed["order_number"])
    assert r.status_code == 200, r.text
    order = r.json()["order"]
    assert order["lalamove_status"] == "ASSIGNING_DRIVER"
    assert order["lalamove_order_id"] in lalamove.orders
    assert order["lalamove_share_link"].startswith("https://")
    assert r.json()["rider"] is None


def test_second_booking_is_refused(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    prepared(client, owner, placed["order_number"])
    book(client, owner, placed["order_number"])
    r = book(client, owner, placed["order_number"])
    assert r.status_code == 409 and "already booked" in r.json()["detail"]
    assert len(lalamove.orders) == 1


def test_price_went_up_leaves_a_note(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    prepared(client, owner, placed["order_number"])
    lalamove.price_bump = 15
    order = book(client, owner, placed["order_number"]).json()["order"]
    assert order["lalamove_fee"] == order["shipping_fee"] + 15
    assert "the customer paid" in order["notes"]


def test_following_the_rider_moves_the_order_along(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    number = placed["order_number"]
    prepared(client, owner, number)
    lm_id = book(client, owner, number).json()["order"]["lalamove_order_id"]
    refresh = lambda: client.post(f"/api/admin/orders/{number}/lalamove/refresh", headers=owner).json()

    lalamove.set_status(lm_id, "ON_GOING")
    seen = refresh()
    assert seen["rider"] == {"name": "Juan Dela Cruz", "phone": "+639181112222", "plate_number": "NAB 1234"}
    assert seen["order"]["order_status"] == "processing"

    lalamove.set_status(lm_id, "PICKED_UP")
    assert refresh()["order"]["order_status"] == "shipped"

    lalamove.set_status(lm_id, "COMPLETED")
    seen = refresh()
    assert seen["order"]["order_status"] == "completed" and seen["rider"] is None


def test_cancel_rider_while_still_finding_one(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    prepared(client, owner, placed["order_number"])
    lm_id = book(client, owner, placed["order_number"]).json()["order"]["lalamove_order_id"]
    r = client.delete(f"/api/admin/orders/{placed['order_number']}/lalamove", headers=owner)
    assert r.status_code == 200 and r.json()["order"]["lalamove_status"] == "CANCELED"
    assert lalamove.orders[lm_id]["status"] == "CANCELED"
    assert book(client, owner, placed["order_number"]).status_code == 200   # can book again


def test_cancel_too_late_gives_a_friendly_message(client, clean_db, customer, owner, lalamove):
    placed = delivery_order(client, customer)
    prepared(client, owner, placed["order_number"])
    lm_id = book(client, owner, placed["order_number"]).json()["order"]["lalamove_order_id"]
    lalamove.set_status(lm_id, "ON_GOING", minutes_since_match=6)
    r = client.delete(f"/api/admin/orders/{placed['order_number']}/lalamove", headers=owner)
    assert r.status_code == 409 and "Cancel it in the Lalamove app" in r.json()["detail"]


def test_customers_cannot_book_riders(client, clean_db, customer, lalamove):
    placed = delivery_order(client, customer)
    r = book(client, customer, placed["order_number"])
    assert r.status_code == 403
    assert lalamove.orders == {}
