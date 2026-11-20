"""Shared set-up for all the API tests.

Safety first:
  * Every key below is FAKE. The real ones in backend/.env are never used
    (except by the opt-in live tests in test_live_providers.py).
  * The tests may not reach the internet at all: any connection that isn't to
    this computer or to the test database fails the test.
  * The database tests run on TEST_DATABASE_URL, a separate, empty database
    that the tests wipe and rebuild. They refuse to run on your real database.
"""

import os
import re
import socket
import sys
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from dotenv import dotenv_values

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

# ---------------------------------------------------------------------
# Fake settings. Set BEFORE the backend is imported, so load_dotenv()
# (which never replaces a setting that's already there) can't bring in real keys.
# ---------------------------------------------------------------------
REAL_ENV = dotenv_values(BACKEND / ".env")
TEST_DB = os.getenv("TEST_DATABASE_URL") or REAL_ENV.get("TEST_DATABASE_URL") or ""

FAKE = {
    "DATABASE_URL": TEST_DB or "postgresql://nobody@127.0.0.1:1/not_used",
    "JWT_SECRET": "test-secret-" + "x" * 40,
    "FRONTEND_URL": "http://localhost:5173",
    "PUBLIC_API_URL": "",
    "PAYREX_API_SECRET": "sk_test_FAKEFAKEFAKE",
    "PAYREX_WEBHOOK_SECRET": "whsk_test_FAKEFAKE",
    "LALAMOVE_API_KEY": "pk_test_FAKEKEY",
    "LALAMOVE_API_SECRET": "sk_test_FAKESECRET",
    "LALAMOVE_MARKET": "PH",
    "LALAMOVE_SERVICE_TYPE": "MOTORCYCLE",
    "SHOP_NAME": "La Crochet",
    "SHOP_PHONE": "0917 123 4567",
    "SHOP_ADDRESS": "12 Sampaguita St, Bagong Silang, Quezon City",
    "SHOP_LAT": "14.676000",
    "SHOP_LNG": "121.043700",
    "GEMINI_API_KEY": "test-gemini-key",
    "GEMINI_MODEL": "gemini-3.8-flash",
    "GEMINI_BACKUP_MODELS": "gemini-3.5-flash-lite,gemini-3.6-flash",
    "GEMINI_THINKING": "minimal",
    "CHAT_GUEST_LIMIT": "20",
    "CHAT_MEMBER_LIMIT": "60",
}
os.environ.update(FAKE)

if TEST_DB and REAL_ENV.get("DATABASE_URL") and TEST_DB.strip() == REAL_ENV["DATABASE_URL"].strip():
    raise SystemExit("TEST_DATABASE_URL is the same as DATABASE_URL. The tests wipe their database: "
                     "use a separate, empty test database.")

from tests.fakes.gemini import FakeGemini  # noqa: E402
from tests.fakes.http import FakeHTTP  # noqa: E402
from tests.fakes.lalamove import FakeLalamove  # noqa: E402
from tests.fakes.payrex import FakePayRex  # noqa: E402

ADDRESS = {"street": "4 Amuslan St", "barangay": "Masambong", "city": "Quezon City",
           "province": "Metro Manila", "postal_code": "1115"}
PIN = {"lat": 14.6500, "lng": 121.0300}
PASSWORD = "supersecret1"


# ---------------------------------------------------------------------
# No internet during tests
# ---------------------------------------------------------------------
def _allowed_hosts() -> set[str]:
    allowed = {"127.0.0.1", "::1", "localhost"}
    host = urlsplit(TEST_DB.replace("postgresql+psycopg", "postgresql")).hostname if TEST_DB else None
    if host:
        try:
            allowed |= {info[4][0] for info in socket.getaddrinfo(host, None)}
        except OSError:
            pass
        allowed.add(host)
    return allowed


@pytest.fixture(autouse=True)
def no_internet(request, monkeypatch):
    if request.node.get_closest_marker("live"):
        yield
        return
    allowed = _allowed_hosts()
    real_connect = socket.socket.connect

    def guarded(sock, address):
        if sock.family in (socket.AF_INET, socket.AF_INET6) and address[0] not in allowed:
            raise AssertionError(f"Test tried to reach the internet: {address}")
        return real_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded)
    yield


# ---------------------------------------------------------------------
# Stand-ins for PayRex, Lalamove and Gemini
# ---------------------------------------------------------------------
@pytest.fixture
def http(monkeypatch):
    fake = FakeHTTP()
    monkeypatch.setattr("requests.request", fake)
    return fake


@pytest.fixture
def payrex(http):
    return FakePayRex(http, FAKE["PAYREX_API_SECRET"], FAKE["PAYREX_WEBHOOK_SECRET"])


@pytest.fixture
def lalamove(http):
    return FakeLalamove(http, FAKE["LALAMOVE_API_KEY"], FAKE["LALAMOVE_API_SECRET"])


@pytest.fixture(scope="session")
def _gemini_server():
    server = FakeGemini(FAKE["GEMINI_API_KEY"])
    yield server
    server.stop()


@pytest.fixture
def gemini(_gemini_server, monkeypatch):
    """Points Yarnie's real Gemini library at the stand-in."""
    from google import genai
    from google.genai import types

    from routes import chatRoutes

    _gemini_server.reset()
    client = genai.Client(
        api_key=FAKE["GEMINI_API_KEY"],
        http_options=types.HttpOptions(base_url=_gemini_server.url, timeout=10_000),
    )
    monkeypatch.setattr(chatRoutes, "_client", client)
    chatRoutes._sent.clear()
    chatRoutes._products_cache.update(text=None, at=0.0)
    return _gemini_server


# ---------------------------------------------------------------------
# Test database: rebuilt once, emptied before each test
# ---------------------------------------------------------------------
DATA_TABLES = ["contact_messages", "newsletter_subscribers", "order_items", "orders", "cart_items",
               "wishlist_items", "addresses", "users", "products", "categories"]


def _run_sql_file(conn, path: Path):
    """Run a whole .sql file (many statements) on the test database."""
    conn.connection.driver_connection.execute(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def database():
    if not TEST_DB:
        pytest.skip("Set TEST_DATABASE_URL (a separate, empty Postgres database) to run the database tests.")
    from sqlalchemy import text

    from database import engine

    with engine.begin() as conn:
        conn.execute(text("drop schema if exists public cascade"))
        conn.execute(text("create schema public"))
        _run_sql_file(conn, BACKEND / "database" / "schema.sql")
    return engine


@pytest.fixture
def clean_db(database):
    from sqlalchemy import text

    with database.begin() as conn:
        conn.execute(text(f"truncate {', '.join(DATA_TABLES)} restart identity cascade"))
        conn.execute(text("alter sequence order_number_seq restart with 1"))
        _run_sql_file(conn, BACKEND / "database" / "seed.sql")
    yield database


@pytest.fixture
def client(clean_db):
    from fastapi.testclient import TestClient

    import main
    from routes import chatRoutes, contactRoutes

    chatRoutes._sent.clear()
    chatRoutes._products_cache.update(text=None, at=0.0)
    contactRoutes._sent.clear()
    with TestClient(main.app) as test_client:
        yield test_client


def sql(engine, query: str, **params):
    from sqlalchemy import text

    with engine.begin() as conn:
        result = conn.execute(text(query), params)
        return result.fetchall() if result.returns_rows else []


# ---------------------------------------------------------------------
# People
# ---------------------------------------------------------------------
def _register(client, email: str, first: str):
    r = client.post("/api/auth/register", json={
        "first_name": first, "last_name": "Santos", "email": email, "password": PASSWORD,
        "phone": "09171234567", "accept_terms": True, "shipping_address": ADDRESS,
    })
    assert r.status_code in (200, 201), r.text
    token = client.post("/api/auth/login", json={"email": email, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def customer(client):
    return _register(client, "ela@example.com", "Ela")


@pytest.fixture
def other_customer(client):
    return _register(client, "ben@example.com", "Ben")


@pytest.fixture
def owner(client, clean_db):
    headers = _register(client, "owner@example.com", "Ralffie")
    sql(clean_db, "update users set role = 'admin' where email = 'owner@example.com'")
    return headers


def order_body(**changes) -> dict:
    body = {
        "customer_name": "Ela Santos", "email": "ela@example.com", "phone": "09171234567",
        "payment_method": "cod", "shipping_method": "pickup", "items": [{"id": 1, "quantity": 1}],
    }
    body.update(changes)
    if body["shipping_method"] == "delivery":
        body.setdefault("shipping_address", ADDRESS)
    return body


def is_order_number(value: str) -> bool:
    return bool(re.fullmatch(r"LC-\d{4}-\d{4,}", value))
