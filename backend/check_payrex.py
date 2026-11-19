"""Find out which part of the payment request PayRex is blocking.

    py check_payrex.py

Tries to create a few TEST payment pages, each a little closer to what the shop
sends, and prints which ones work. Every page it creates is cancelled straight
away. It refuses to run with a live key, so no real money is involved.
"""

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv
from payrex import Client
from payrex.http_client import HttpClient

load_dotenv(Path(__file__).with_name(".env"))
API_KEY = os.getenv("PAYREX_API_SECRET", "")
if not API_KEY.startswith("sk_test_"):
    sys.exit("PAYREX_API_SECRET in .env must be your TEST key (sk_test_...) for this check.")

FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
LINK = "order=LC-2026-9999&token=00000000-0000-0000-0000-000000000000"
ITEM = [{"name": "Test item", "amount": 45000, "quantity": 1}]

STEPS = [
    ("A. page with public return addresses (no localhost)",
     {"currency": "PHP", "line_items": ITEM, "payment_methods": ["card"],
      "success_url": "https://example.com/success", "cancel_url": "https://example.com/cancel"}),
    ("1. simplest page (card only)",
     {"currency": "PHP", "line_items": ITEM, "payment_methods": ["card"],
      "success_url": f"{FRONTEND}/order-confirmation", "cancel_url": f"{FRONTEND}/checkout"}),
    ("2. + all payment methods",
     {"currency": "PHP", "line_items": ITEM, "payment_methods": ["gcash", "card", "maya", "qrph"],
      "success_url": f"{FRONTEND}/order-confirmation", "cancel_url": f"{FRONTEND}/checkout"}),
    ("3. + order link in the return address",
     {"currency": "PHP", "line_items": ITEM, "payment_methods": ["gcash", "card", "maya", "qrph"],
      "success_url": f"{FRONTEND}/order-confirmation?{LINK}",
      "cancel_url": f"{FRONTEND}/checkout?payment=cancelled&{LINK}"}),
    ("4. + description",
     {"currency": "PHP", "line_items": ITEM, "payment_methods": ["gcash", "card", "maya", "qrph"],
      "success_url": f"{FRONTEND}/order-confirmation?{LINK}",
      "cancel_url": f"{FRONTEND}/checkout?payment=cancelled&{LINK}",
      "description": "La Crochet order LC-2026-9999"}),
    ("5. + order number (metadata) = exactly what the shop sends",
     {"currency": "PHP", "line_items": ITEM, "payment_methods": ["gcash", "card", "maya", "qrph"],
      "success_url": f"{FRONTEND}/order-confirmation?{LINK}",
      "cancel_url": f"{FRONTEND}/checkout?payment=cancelled&{LINK}",
      "description": "La Crochet order LC-2026-9999",
      "metadata": {"order_number": "LC-2026-9999"}}),
]


def encode(params):
    """Same way the PayRex library packs the request."""
    flat = HttpClient(API_KEY, "")._http_build_query(params)
    return re.sub(r"%5B[\d+]%5D", "%5B%5D", urlencode(flat))


def main():
    payrex = Client(API_KEY)
    print(f"Sending to {payrex.config.api_base_url} with your TEST key\n")

    # B. Can this key read anything at all? (Your webhook setup worked, so this should be OK.)
    response = requests.get(f"{payrex.config.api_base_url}/webhooks", auth=(API_KEY, ""), timeout=30)
    print(f"B. read your webhooks\n   {'OK' if response.ok else response.status_code}\n")

    # C. Can this key start a payment at all, without a payment page?
    response = requests.post(
        f"{payrex.config.api_base_url}/payment_intents",
        auth=(API_KEY, ""),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=encode({"amount": 45000, "currency": "PHP", "payment_methods": ["card"]}),
        timeout=30,
    )
    body = response.text.strip().replace("\r", "").replace("\n", " ")
    print(f"C. start a payment without a payment page\n   {'OK' if response.ok else str(response.status_code) + ' ' + body[:200]}\n")
    for label, params in STEPS:
        try:
            response = requests.post(
                f"{payrex.config.api_base_url}/checkout_sessions",
                auth=(API_KEY, ""),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data=encode(params),
                timeout=30,
            )
        except requests.RequestException as exc:
            print(f"{label}\n   NO CONNECTION: {exc}\n")
            continue

        if response.ok:
            session_id = response.json().get("id")
            print(f"{label}\n   OK ({session_id})\n")
            try:
                payrex.checkout_sessions.expire(session_id)  # tidy up
            except Exception:
                pass
        else:
            body = response.text.strip().replace("\r", "").replace("\n", " ")
            kind = "BLOCKED before reaching PayRex" if body.lower().startswith("<html") else "PayRex said"
            print(f"{label}\n   {response.status_code} {kind}: {body[:300]}\n")


if __name__ == "__main__":
    main()
