"""A stand-in for Google's Gemini server, running on this computer.

Yarnie's real Gemini library talks to it over HTTP, so the tests check the exact
message the library sends (tests/contracts/gemini.py), not just our own code.
"""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from tests.contracts import gemini as contract


class FakeGemini:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.requests: list[dict] = []     # {"model", "version", "body"}
        self.behaviour: dict[str, tuple] = {}   # model -> ("error", code, status) | ("refuse_thinking",) | ("empty",)
        self.answer = lambda body, model: "Hello po! I'm Yarnie."
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                match = re.fullmatch(r"/(v1|v1beta)/models/([\w.\-]+):generateContent", self.path.split("?")[0])
                if not match:
                    return self._send(404, contract.error(404, "NOT_FOUND", f"unknown path {self.path}"))
                if self.headers.get("x-goog-api-key") != fake.api_key:
                    return self._send(401, contract.error(401, "UNAUTHENTICATED", "API key not valid."))
                version, model = match.groups()
                raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                body = json.loads(raw)
                fake.requests.append({"model": model, "version": version, "body": body})
                try:
                    contract.GenerateContentRequest.model_validate(body)
                except Exception as exc:  # the library sent something Gemini doesn't accept
                    return self._send(400, contract.error(400, "INVALID_ARGUMENT", f"(contract) {exc}"))

                rule = fake.behaviour.get(model, ("ok",))
                if rule[0] == "error":
                    _, code, status = rule
                    message = {503: "This model is currently experiencing high demand.",
                               429: "Resource has been exhausted (e.g. check quota).",
                               404: f"models/{model} is not found."}.get(code, "error")
                    return self._send(code, contract.error(code, status, message))
                thinking = (body.get("generationConfig") or {}).get("thinkingConfig")
                if rule[0] == "refuse_thinking" and thinking:
                    return self._send(400, contract.error(400, "INVALID_ARGUMENT",
                                                          "Thinking level is not supported for this model."))
                if rule[0] == "empty":
                    return self._send(200, {"candidates": [{"content": {"role": "model", "parts": []},
                                                            "finishReason": "SAFETY"}]})
                return self._send(200, contract.reply(fake.answer(body, model), model))

            def _send(self, code, payload):
                data = json.dumps(payload).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def reset(self):
        self.requests.clear()
        self.behaviour.clear()
        self.answer = lambda body, model: "Hello po! I'm Yarnie."

    def stop(self):
        self.server.shutdown()

    def last(self) -> dict:
        return self.requests[-1]

    @staticmethod
    def instructions(body: dict) -> str:
        return "".join(part["text"] for part in body["systemInstruction"]["parts"])
