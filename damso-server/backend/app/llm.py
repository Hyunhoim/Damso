"""HCX-007 adapter and private, hot-reloadable credentials. No STT/TTS client."""

import json
import os
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError

from app.core.config import settings
from app.domain_schemas import ModelResult
from app.summary_styles import STYLE_INSTRUCTIONS, SummaryStyle

MODEL = "HCX-007"
ENDPOINT = "https://clovastudio.stream.ntruss.com/v3/chat-completions/HCX-007"
PROMPT_VERSION = "damso-v1.8"
PROMPT_PATH = Path(__file__).parent / "prompts" / "damso_v1.txt"
MAX_RESPONSE_BYTES = 256 * 1024


class ProviderError(Exception):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ClovaCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: SecretStr


def credential() -> ClovaCredential | None:
    try:
        raw = settings.CLOVA_CONFIG_FILE.read_bytes()
        if len(raw) > 4096:
            return None
        value = ClovaCredential.model_validate_json(raw)
        return value if value.api_key.get_secret_value() else None
    except OSError, ValueError:
        return None


def save_credential(key: SecretStr) -> None:
    target = settings.CLOVA_CONFIG_FILE
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    staged = target.with_name(f".{target.name}.{secrets.token_hex(8)}.tmp")
    try:
        fd = os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"api_key": key.get_secret_value()}, handle)
        staged.replace(target)
    finally:
        staged.unlink(missing_ok=True)


def provider_status() -> dict[str, str]:
    from app.speech import credential as speech_credential

    return {
        "stt": "configured" if speech_credential() else "not_configured",
        "llm": "configured" if credential() else "not_configured",
    }


def output_schema() -> dict[str, Any]:
    # CLOVA supports a subset of JSON schema. Empty string represents no question.
    return {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["ready", "no_story", "declined"],
                "description": "기록 가능, 관련 경험 없음, 경험 없이 답변 중단",
            },
            "title": {
                "type": "string",
                "description": "이야기를 대표하는 대제목 하나. 8~20자 권장, 최대 40자. 기록 불가 시 빈 문자열",
            },
            "summary": {
                "type": "string",
                "description": "작성자 관점의 1인칭 요약. 서버가 지정한 문체를 따르며 이름·호칭 머리말은 생략",
            },
            "follow_up_question": {
                "type": "string",
                "description": "단일 존댓말 질문. 필요하지 않으면 빈 문자열",
            },
        },
        "required": ["status", "title", "summary", "follow_up_question"],
    }


class HCXProvider:
    def __init__(
        self, key: SecretStr, *, transport: httpx.BaseTransport | None = None
    ) -> None:
        self.key = key
        self.transport = transport

    def organize(
        self,
        *,
        question: str,
        original_text: str,
        author_name: str = "",
        summary_style: SummaryStyle = "auto",
    ) -> ModelResult:
        if (
            summary_style not in STYLE_INSTRUCTIONS
            or not original_text.strip()
            or len(original_text) > 20000
            or len(question) > 500
            or len(author_name) > 255
        ):
            raise ProviderError("INVALID_INPUT")
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": PROMPT_PATH.read_text(encoding="utf-8")
                    + "\n[이번 요약의 문체]\n"
                    + STYLE_INSTRUCTIONS[summary_style],
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "question": question,
                            "original_text": original_text,
                            "author_name": author_name.strip(),
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            "thinking": {"effort": "none"},
            "responseFormat": {"type": "json", "schema": output_schema()},
            "maxCompletionTokens": 2048,
            "temperature": 0.2,
            "topP": 0.8,
            "repetitionPenalty": 1.05,
            "seed": 42,
        }
        try:
            with httpx.Client(
                timeout=httpx.Timeout(60, connect=10, write=10, pool=5),
                follow_redirects=False,
                trust_env=False,
                transport=self.transport,
            ) as client:
                started = time.monotonic()
                with client.stream(
                    "POST",
                    ENDPOINT,
                    headers={
                        "Authorization": f"Bearer {self.key.get_secret_value()}",
                        "X-NCP-CLOVASTUDIO-REQUEST-ID": str(uuid.uuid4()),
                        "Accept": "application/json",
                    },
                    json=payload,
                ) as response:
                    if response.status_code != 200:
                        code = {
                            401: "AUTH_FAILED",
                            403: "ACCESS_DENIED",
                            429: "RATE_LIMITED",
                        }.get(
                            response.status_code,
                            "PROVIDER_UNAVAILABLE"
                            if response.status_code >= 500
                            else "REQUEST_REJECTED",
                        )
                        raise ProviderError(code)
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if (
                            len(content) > MAX_RESPONSE_BYTES
                            or time.monotonic() - started > 90
                        ):
                            raise ProviderError("RESPONSE_LIMIT")
                    data = json.loads(content)
            if data.get("status", {}).get("code") != "20000":
                raise ProviderError("REQUEST_REJECTED")
            result = data["result"]
            if result.get("finishReason") != "stop":
                raise ProviderError("INCOMPLETE_OUTPUT")
            output = json.loads(result["message"]["content"])
            if not isinstance(output, dict) or set(output) != {
                "status",
                "title",
                "summary",
                "follow_up_question",
            }:
                raise ProviderError("INVALID_PROVIDER_OUTPUT")
            if output["follow_up_question"] == "":
                output["follow_up_question"] = None
            value = ModelResult.model_validate(output)
            if value.follow_up_question and (
                value.follow_up_question.count("?")
                + value.follow_up_question.count("？")
                > 1
                or "\n" in value.follow_up_question
            ):
                raise ProviderError("INVALID_PROVIDER_OUTPUT")
            return value
        except httpx.TimeoutException:
            raise ProviderError("PROVIDER_TIMEOUT") from None
        except httpx.HTTPError:
            raise ProviderError("PROVIDER_UNAVAILABLE") from None
        except ValueError, KeyError, TypeError, AttributeError, ValidationError:
            raise ProviderError("INVALID_PROVIDER_OUTPUT") from None


def configured_provider() -> HCXProvider | None:
    config = credential()
    return HCXProvider(config.api_key) if config else None
