"""INTEGRATION tests: the owner uploading a product photo."""

import pytest

from routes import photoRoutes

pytestmark = pytest.mark.integration

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture(autouse=True)
def photo_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(photoRoutes, "PRODUCT_PHOTOS", tmp_path)   # never write into the real folder
    return tmp_path


def test_owner_uploads_a_photo(client, owner, photo_folder):
    r = client.post("/api/admin/uploads/product-photo", headers={**owner, "Content-Type": "image/png"}, content=PNG)
    assert r.status_code == 201
    url = r.json()["image_url"]
    assert url.startswith("/uploads/products/") and url.endswith(".png")
    assert (photo_folder / url.rsplit("/", 1)[1]).read_bytes() == PNG


def test_not_a_photo_is_refused(client, owner):
    r = client.post("/api/admin/uploads/product-photo", headers=owner, content=b"<script>alert(1)</script>")
    assert r.status_code == 415 and "JPG, PNG, WebP or GIF" in r.json()["detail"]


def test_too_big_is_refused(client, owner, monkeypatch):
    monkeypatch.setattr(photoRoutes, "MAX_BYTES", 32)
    r = client.post("/api/admin/uploads/product-photo", headers=owner, content=PNG)
    assert r.status_code == 413


def test_customers_cannot_upload(client, customer):
    assert client.post("/api/admin/uploads/product-photo", headers=customer, content=PNG).status_code == 403


def test_photos_folder_is_served_to_the_website(client):
    folder = photoRoutes.UPLOAD_ROOT / "products"
    folder.mkdir(parents=True, exist_ok=True)
    photo = folder / "test-served-photo.png"
    photo.write_bytes(PNG)
    try:
        r = client.get("/uploads/products/test-served-photo.png")
        assert r.status_code == 200 and r.content == PNG
        assert r.headers["content-type"] == "image/png"
    finally:
        photo.unlink()
