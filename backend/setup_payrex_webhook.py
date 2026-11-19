"""Connect PayRex to this shop's webhook, in one command.

PayRex doesn't have a button for this in its dashboard yet: webhooks are made
through its API. This script does it for you.

    py setup_payrex_webhook.py https://your-tunnel-address.trycloudflare.com

- First time: creates the webhook and saves its secret (whsk_...) into .env.
- Tunnel address changed? Run it again with the new address: it updates the
  same webhook instead of making a second one, and the secret stays the same.
"""

import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from payrex import Client

WEBHOOK_PATH = "/api/payments/payrex-webhook"
EVENTS = ["payment_intent.succeeded"]
ENV_FILE = Path(__file__).with_name(".env")


def save_secret(secret: str) -> None:
    """Put PAYREX_WEBHOOK_SECRET=... in .env, replacing an old one if there is one."""
    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    line = f"PAYREX_WEBHOOK_SECRET={secret}"
    if re.search(r"^PAYREX_WEBHOOK_SECRET=.*$", text, flags=re.M):
        text = re.sub(r"^PAYREX_WEBHOOK_SECRET=.*$", line, text, flags=re.M)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += line + "\n"
    ENV_FILE.write_text(text, encoding="utf-8")


def hide(secret: str) -> str:
    return secret[:5] + "…" + secret[-4:] if secret and len(secret) > 10 else "(hidden)"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: py setup_payrex_webhook.py https://your-tunnel-address.trycloudflare.com")

    address = sys.argv[1].strip().rstrip("/")
    if not address.startswith("https://"):
        sys.exit("The address must start with https:// (copy it from the cloudflared window).")
    url = address if address.endswith(WEBHOOK_PATH) else address + WEBHOOK_PATH

    load_dotenv(ENV_FILE)
    api_key = os.getenv("PAYREX_API_SECRET")
    if not api_key:
        sys.exit("PAYREX_API_SECRET is missing from backend/.env. Add your sk_test_ key first.")
    mode = "TEST" if api_key.startswith("sk_test_") else "LIVE"
    payrex = Client(api_key)

    # Already made one for this shop? Update it rather than making a duplicate.
    existing = [hook for hook in payrex.webhooks.list().data if (hook.url or "").endswith(WEBHOOK_PATH)]

    if existing:
        hook = payrex.webhooks.update(existing[0].id, {"url": url, "events": EVENTS})
        print(f"Updated your {mode} webhook {hook.id}")
        print(f"  now sends to: {hook.url}")
        if hook.status and hook.status != "enabled":
            payrex.webhooks.enable(hook.id)
            print("  (it was turned off, so it has been turned back on)")
        print("  Your secret in .env stays the same.")
        if len(existing) > 1:
            print(f"Note: there are {len(existing)} shop webhooks. Only the first was updated:")
            for extra in existing[1:]:
                print(f"  {extra.id}  {extra.url}")
        return

    hook = payrex.webhooks.create(
        {"url": url, "events": EVENTS, "description": "La Crochet: mark online orders as paid"}
    )
    if not hook.secret_key:
        sys.exit(f"Webhook {hook.id} was created, but PayRex didn't return its secret. Ask PayRex support for it.")
    save_secret(hook.secret_key)
    print(f"Created your {mode} webhook {hook.id}")
    print(f"  sends to: {hook.url}")
    print(f"  secret saved in backend/.env as PAYREX_WEBHOOK_SECRET ({hide(hook.secret_key)})")
    print("Now restart the backend so it reads the new secret.")


if __name__ == "__main__":
    main()
