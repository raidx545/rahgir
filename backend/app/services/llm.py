"""OpenRouter LLM client for itinerary narration."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ..config import settings

URL = "https://openrouter.ai/api/v1/chat/completions"


class LLMError(RuntimeError):
    """Any recoverable failure talking to OpenRouter."""


async def chat_json(
    client: httpx.AsyncClient,
    system: str,
    user: str,
    model: str | None = None,
) -> dict:
    """Call the LLM and parse a JSON object from its reply.

    Tolerates models that wrap JSON in prose or ```json fences, and models
    that reject the `response_format` parameter (retries once without it).
    """
    settings.require("openrouter_api_key")
    model = model or settings.openrouter_model
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/raidx/rahgir",
        "X-Title": "Rahgir",
    }
    base_body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.6,
    }

    # First attempt asks for structured JSON; if the model/provider rejects that
    # parameter (HTTP 400/404/422), retry once without it.
    content = await _post(client, headers, {**base_body, "response_format": {"type": "json_object"}},
                          allow_retry=True)
    if content is None:
        content = await _post(client, headers, base_body, allow_retry=False)
    return _extract_json(content)


async def chat_text(
    client: httpx.AsyncClient,
    system: str,
    user: str,
    model: str | None = None,
    temperature: float = 0.5,
) -> str:
    """Call the LLM and return the plain text reply (for Q&A / chat)."""
    settings.require("openrouter_api_key")
    model = model or settings.openrouter_model
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/raidx/rahgir",
        "X-Title": "Rahgir",
    }
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    content = await _post(client, headers, body, allow_retry=False)
    return (content or "").strip()


async def stream_text(
    client: httpx.AsyncClient,
    system: str,
    user: str,
    model: str | None = None,
    temperature: float = 0.5,
) -> AsyncIterator[str]:
    """Yield the LLM reply token-by-token (for streaming chat)."""
    settings.require("openrouter_api_key")
    model = model or settings.openrouter_model
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/raidx/rahgir",
        "X-Title": "Rahgir",
    }
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "stream": True,
    }
    try:
        async with client.stream(
            "POST", URL, json=body, headers=headers, timeout=settings.request_timeout_s * 2
        ) as r:
            if r.status_code != 200:
                detail = (await r.aread()).decode("utf-8", "ignore")[:200]
                raise LLMError(f"OpenRouter error (HTTP {r.status_code}): {detail}")
            async for line in r.aiter_lines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                except (ValueError, KeyError, IndexError, TypeError):
                    continue
                if delta:
                    yield delta
    except httpx.HTTPError as e:
        raise LLMError(f"Could not reach OpenRouter: {e}") from e


async def _post(client, headers, body, *, allow_retry: bool) -> str | None:
    try:
        r = await client.post(
            URL, json=body, headers=headers, timeout=settings.request_timeout_s * 2
        )
    except httpx.HTTPError as e:
        raise LLMError(f"Could not reach OpenRouter: {e}") from e

    if r.status_code == 401:
        raise LLMError("OpenRouter rejected the key (check OPENROUTER_API_KEY).")
    if allow_retry and r.status_code in (400, 404, 422):
        # likely the response_format param — signal caller to retry without it
        return None
    if r.status_code != 200:
        raise LLMError(f"OpenRouter error (HTTP {r.status_code}): {r.text[:200]}")
    try:
        return r.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise LLMError("Unexpected response shape from OpenRouter.") from e


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        # strip ```json ... ``` fences
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError as e:
                raise LLMError("Could not parse JSON from LLM response.") from e
        raise LLMError("Could not parse JSON from LLM response.")
