"""Checks the Lalamove settings in backend/.env WITHOUT showing their values.

    py check_delivery_setup.py
"""

import os
from pathlib import Path

from dotenv import dotenv_values

ENV_FILE = Path(__file__).with_name(".env")
REQUIRED = ["LALAMOVE_API_KEY", "LALAMOVE_API_SECRET", "SHOP_LAT", "SHOP_LNG"]
FOR_BOOKING = ["SHOP_PHONE", "SHOP_ADDRESS", "SHOP_NAME"]

values = dotenv_values(ENV_FILE) if ENV_FILE.exists() else {}
print(f".env found: {'yes' if ENV_FILE.exists() else 'NO'} ({ENV_FILE})\n")


def show(name):
    value = (values.get(name) or "").strip()
    if not value:
        close = [key for key in values if key.replace(" ", "").upper() == name or name in key.upper()]
        hint = f"  <- found a similar name: {close[0]!r}, rename it to {name}" if close else ""
        print(f"  MISSING  {name}{hint}")
        return False
    extra = ""
    if name == "LALAMOVE_API_KEY":
        extra = "  (test key)" if value.startswith("pk_test") else "  (LIVE key!)" if value.startswith("pk_") else "  <- should start with pk_test_"
    if name == "LALAMOVE_API_SECRET" and not value.startswith("sk_"):
        extra = "  <- should start with sk_test_"
    if name in ("SHOP_LAT", "SHOP_LNG"):
        try:
            number = float(value)
            ok = 4 <= number <= 21.5 if name == "SHOP_LAT" else 116 <= number <= 127.5
            extra = "" if ok else "  <- doesn't look like a Philippine location (LAT ~14, LNG ~121 for Manila)"
        except ValueError:
            extra = "  <- must be just a number like 14.6760 (no letters or commas)"
    print(f"  ok       {name}{extra}")
    return not extra.startswith("  <-")


print("Needed for the map and delivery price:")
ready = all([show(name) for name in REQUIRED])
print("\nNeeded for booking a rider:")
for name in FOR_BOOKING:
    show(name)

print("\n" + ("All set. If /api/delivery/info still says false, fully restart the backend (Ctrl+C, then start it again)."
              if ready else "Fix the lines marked above, save .env, then restart the backend."))
