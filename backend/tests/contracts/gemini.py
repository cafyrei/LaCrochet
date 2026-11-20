"""Google Gemini's rules (the "contract") for the one call Yarnie makes.

Source: Gemini API reference, models.generateContent (ai.google.dev):
  POST {base}/{version}/models/{model}:generateContent, key in "x-goog-api-key".
  Body: contents [{role: "user" | "model", parts: [{text}]}],
  (field names may be camelCase or snake_case: Google reads both),
        systemInstruction {parts: [{text}]},
        generationConfig {temperature, maxOutputTokens, thinkingConfig {thinkingLevel}}.
  Answer: candidates[0].content.parts[].text, finishReason.
  Errors: {"error": {"code", "message", "status"}}; 429 RESOURCE_EXHAUSTED,
  503 UNAVAILABLE ("high demand"), 404 NOT_FOUND (unknown model),
  400 INVALID_ARGUMENT (e.g. a thinking level the model doesn't accept).
"""

from typing import Literal, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field

THINKING_LEVELS = {"MINIMAL", "LOW", "MEDIUM", "HIGH", "XHIGH"}


class Part(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)


class Content(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "model"]
    parts: list[Part] = Field(min_length=1)


class SystemInstruction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parts: list[Part] = Field(min_length=1)
    role: Optional[str] = None


class ThinkingConfig(BaseModel):
    """Google's servers read JSON field names in either style (thinkingLevel or
    thinking_level, the standard "protobuf JSON" rule), and the Python library
    sends thinking_level, so both are accepted."""

    model_config = ConfigDict(extra="forbid")
    thinkingLevel: Optional[str] = Field(default=None, validation_alias=AliasChoices("thinkingLevel", "thinking_level"))
    thinkingBudget: Optional[int] = Field(default=None, validation_alias=AliasChoices("thinkingBudget", "thinking_budget"))
    includeThoughts: Optional[bool] = Field(default=None, validation_alias=AliasChoices("includeThoughts", "include_thoughts"))


class GenerationConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    maxOutputTokens: Optional[int] = Field(default=None, gt=0)
    thinkingConfig: Optional[ThinkingConfig] = None


class GenerateContentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contents: list[Content] = Field(min_length=1)
    systemInstruction: Optional[SystemInstruction] = None
    generationConfig: Optional[GenerationConfig] = None
    safetySettings: Optional[list] = None
    tools: Optional[list] = None
    toolConfig: Optional[dict] = None
    cachedContent: Optional[str] = None


class Candidate(BaseModel):
    content: Content
    finishReason: Optional[str] = None


class GenerateContentResponse(BaseModel):
    candidates: list[Candidate] = Field(min_length=1)


def reply(text: str, model: str) -> dict:
    """A real-looking Gemini answer."""
    return {
        "candidates": [{"content": {"role": "model", "parts": [{"text": text}]}, "finishReason": "STOP", "index": 0}],
        "usageMetadata": {"promptTokenCount": 900, "candidatesTokenCount": 40, "totalTokenCount": 940},
        "modelVersion": model,
    }


def error(code: int, status: str, message: str) -> dict:
    return {"error": {"code": code, "message": message, "status": status}}
