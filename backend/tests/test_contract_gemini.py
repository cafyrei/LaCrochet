"""CONTRACT tests: Google Gemini.

Yarnie's real Gemini library sends its request to a stand-in Gemini server on
this computer, which checks it against Gemini's published request format
(tests/contracts/gemini.py). We also check that each kind of answer or error
Gemini can give is handled the right way. These don't need the database.
"""

import pytest

from tests.conftest import FAKE
from tests.contracts import gemini as contract

pytestmark = pytest.mark.contract


def ask(text="Hi", history=None):
    from routes.chatRoutes import ChatMessage, ask_gemini

    messages = [ChatMessage(**m) for m in (history or [])] + [ChatMessage(role="user", text=text)]
    return ask_gemini("You are Yarnie. SHOP FACTS: ...", messages)


def test_request_matches_gemini_format(gemini):
    assert ask("Magkano po ang delivery?") == "Hello po! I'm Yarnie."
    sent = gemini.last()
    body = contract.GenerateContentRequest.model_validate(sent["body"])      # unknown fields refused
    assert sent["model"] == FAKE["GEMINI_MODEL"]
    assert body.contents[-1].role == "user" and body.contents[-1].parts[0].text == "Magkano po ang delivery?"
    assert "Yarnie" in gemini.instructions(sent["body"])                      # rules go in systemInstruction
    config = body.generationConfig
    assert config.temperature == 0.6 and config.maxOutputTokens == 700
    assert config.thinkingConfig.thinkingLevel.upper() in contract.THINKING_LEVELS


def test_api_key_is_sent_in_the_header_not_the_address(gemini):
    ask()
    # The stand-in refuses requests without "x-goog-api-key"; reaching here means it was there.
    assert gemini.requests


def test_conversation_starts_with_the_customer(gemini):
    ask("Second question", history=[
        {"role": "model", "text": "Hi! I'm Yarnie."},          # the greeting is dropped
        {"role": "user", "text": "First question"},
        {"role": "model", "text": "First answer"},
    ])
    roles = [c["role"] for c in gemini.last()["body"]["contents"]]
    assert roles == ["user", "model", "user"]


def test_only_the_last_12_messages_are_sent(gemini):
    history = []
    for i in range(10):
        history += [{"role": "user", "text": f"q{i}"}, {"role": "model", "text": f"a{i}"}]
    ask("latest", history=history)
    contents = gemini.last()["body"]["contents"]
    assert len(contents) <= 12 and contents[0]["role"] == "user" and contents[-1]["parts"][0]["text"] == "latest"


def test_answer_text_is_read_from_the_first_candidate(gemini):
    gemini.answer = lambda body, model: "  Sige po!  "
    assert ask() == "Sige po!"
    contract.GenerateContentResponse.model_validate(contract.reply("x", "m"))


def test_busy_model_falls_back_to_backup(gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("error", 503, "UNAVAILABLE")
    assert ask() == "Hello po! I'm Yarnie."
    assert [r["model"] for r in gemini.requests] == ["gemini-3.8-flash", "gemini-3.5-flash-lite"]


def test_quota_used_up_falls_back_to_backup(gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("error", 429, "RESOURCE_EXHAUSTED")
    ask()
    assert gemini.requests[-1]["model"] == "gemini-3.5-flash-lite"


def test_unknown_backup_name_is_skipped(gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("error", 503, "UNAVAILABLE")
    gemini.behaviour["gemini-3.5-flash-lite"] = ("error", 404, "NOT_FOUND")
    ask()
    assert [r["model"] for r in gemini.requests] == ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"]


def test_unknown_main_model_is_reported_not_hidden(gemini):
    from google.genai.errors import APIError

    gemini.behaviour["gemini-3.8-flash"] = ("error", 404, "NOT_FOUND")
    with pytest.raises(APIError) as caught:
        ask()
    # A typo in GEMINI_MODEL isn't papered over with a backup: one model, asked once.
    assert caught.value.code == 404 and {r["model"] for r in gemini.requests} == {"gemini-3.8-flash"}


def test_model_that_refuses_the_thinking_setting_is_asked_again_without_it(gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("refuse_thinking",)
    assert ask() == "Hello po! I'm Yarnie."
    first, second = gemini.requests[-2:]
    assert "thinkingConfig" in first["body"]["generationConfig"]   # first try: with the thinking setting
    assert "thinkingConfig" not in (second["body"].get("generationConfig") or {})


def test_every_model_busy_raises_so_the_page_can_say_so(gemini):
    from google.genai.errors import APIError

    from routes.chatRoutes import _friendly_error

    for model in ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"):
        gemini.behaviour[model] = ("error", 503, "UNAVAILABLE")
    with pytest.raises(APIError) as caught:
        ask()
    friendly = _friendly_error(caught.value)
    assert friendly.status_code == 503 and "busy" in friendly.detail


def test_empty_answer_is_handled(gemini):
    gemini.behaviour["gemini-3.8-flash"] = ("empty",)
    assert ask() == ""      # the route turns this into a polite "can't help with that"


def test_wrong_key_is_not_retried_on_backups(gemini, monkeypatch):
    from google import genai
    from google.genai import types
    from google.genai.errors import APIError

    from routes import chatRoutes

    monkeypatch.setattr(chatRoutes, "_client", genai.Client(
        api_key="wrong-key", http_options=types.HttpOptions(base_url=gemini.url)))
    with pytest.raises(APIError) as caught:
        ask()
    assert caught.value.code == 401
