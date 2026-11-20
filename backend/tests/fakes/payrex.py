"""A stand-in for PayRex that follows PayRex's documented rules.

It checks every request against tests/contracts/payrex.py (a mistake fails the
test), remembers checkout sessions and payments, and can play "the customer paid".
"""

import itertools
import json
import time

from requests.auth import HTTPBasicAuth

from tests.contracts import payrex as contract

BASE = contract.API_BASE.replace(".", r"\.")


class FakePayRex:
    def __init__(self, http, api_key: str, webhook_secret: str):
        self.api_key = api_key
        self.webhook_secret = webhook_secret
        self.sessions: dict[str, dict] = {}
        self.intents: dict[str, dict] = {}
        self.created: list[contract.CheckoutSessionCreate] = []
        self.refuse_next_create = None   # e.g. (400, {"errors": [...]})
        self._ids = itertools.count(1)
        http.route("POST", rf"{BASE}/checkout_sessions", self._create)
        http.route("GET", rf"{BASE}/checkout_sessions/([\w]+)", self._get_session)
        http.route("POST", rf"{BASE}/checkout_sessions/([\w]+)/expire", self._expire)
        http.route("GET", rf"{BASE}/payment_intents/([\w]+)", self._get_intent)

    # ---- checks every request must pass ----
    def _check_auth(self, sent):
        assert isinstance(sent.auth, HTTPBasicAuth), "PayRex needs HTTP Basic auth"
        assert sent.auth.username == self.api_key and sent.auth.password == "", "wrong PayRex key"
        assert sent.headers.get("Content-Type") == "application/x-www-form-urlencoded"

    # ---- endpoints ----
    def _create(self, sent):
        self._check_auth(sent)
        params = contract.CheckoutSessionCreate.model_validate(contract.parse_form(sent.body))
        self.created.append(params)
        if self.refuse_next_create:
            refusal, self.refuse_next_create = self.refuse_next_create, None
            return refusal
        n = next(self._ids)
        intent_id, session_id = f"pi_test{n:04d}", f"cs_test{n:04d}"
        total = sum(item.amount * item.quantity for item in params.line_items)
        self.intents[intent_id] = {
            "id": intent_id, "resource": "payment_intent", "amount": total, "currency": "PHP",
            "status": "awaiting_payment_method", "description": params.description,
            "metadata": params.metadata, "livemode": False,
        }
        self.sessions[session_id] = {
            "id": session_id, "resource": "checkout_session", "status": "active", "currency": "PHP",
            "url": f"https://checkout.payrexhq.com/c/{session_id}",
            "line_items": [item.model_dump(exclude_none=True) for item in params.line_items],
            "payment_intent": self.intents[intent_id], "metadata": params.metadata,
            "success_url": params.success_url, "cancel_url": params.cancel_url,
            "payment_methods": params.payment_methods, "description": params.description,
            "livemode": False, "expires_at": int(time.time()) + 86400,
        }
        return 200, self.sessions[session_id]

    def _get_session(self, sent, session_id):
        self._check_auth(sent)
        if session_id not in self.sessions:
            return 404, {"errors": [{"code": "resource_not_found", "detail": "No such checkout session."}]}
        return 200, self.sessions[session_id]

    def _expire(self, sent, session_id):
        self._check_auth(sent)
        session = self.sessions[session_id]
        if session["status"] != "active":
            return 400, {"errors": [{"code": "parameter_invalid", "detail": "Only active sessions can be expired."}]}
        session["status"] = "expired"
        return 200, session

    def _get_intent(self, sent, intent_id):
        self._check_auth(sent)
        if intent_id not in self.intents:
            return 404, {"errors": [{"code": "resource_not_found", "detail": "No such payment intent."}]}
        return 200, self.intents[intent_id]

    # ---- things that happen on PayRex's side ----
    def last_session(self) -> dict:
        return list(self.sessions.values())[-1]

    def customer_pays(self, session_id: str, amount: int | None = None) -> dict:
        """The customer pays on PayRex's page. Returns the payment intent."""
        session = self.sessions[session_id]
        intent = session["payment_intent"]
        intent["status"] = "succeeded"
        if amount is not None:
            intent["amount"] = amount
        session["status"] = "completed"
        return intent

    def webhook(self, intent: dict, event_type: str = "payment_intent.succeeded", live: bool = False,
                secret: str | None = None) -> tuple[bytes, dict]:
        """The message PayRex posts to our webhook: (raw body, headers)."""
        body = json.dumps({
            "id": f"evt_test{next(self._ids):04d}", "resource": "event", "type": event_type,
            "livemode": live, "pending_webhooks": 1,
            "data": {"resource": intent, "previous_attributes": {"status": "awaiting_next_action"}},
        }).encode()
        header = contract.sign_webhook(body, secret or self.webhook_secret, int(time.time()), live=live)
        return body, {"Payrex-Signature": header, "Content-Type": "application/json"}
