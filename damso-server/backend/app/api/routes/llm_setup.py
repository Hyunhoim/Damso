"""Opt-in loopback-only developer UI, separate from the mobile settings screen."""

import secrets
import tempfile
import threading
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.llm import (
    MODEL,
    PROMPT_PATH,
    PROMPT_VERSION,
    ProviderError,
    configured_provider,
    credential,
    save_credential,
)
from app.llm_cases import CASES
from app.rate_limit import client_key, enforce_limit
from app.speech import (
    SpeechCredential,
)
from app.speech import (
    configured_provider as configured_speech_provider,
)
from app.speech import (
    credential as speech_credential,
)
from app.speech import (
    save_credential as save_speech_credential,
)
from app.summary_styles import SummaryStyle

ASSETS = Path(__file__).resolve().parents[2] / "setup_ui"
SETUP_TOKEN = secrets.token_urlsafe(32)
TEST_LOCK = threading.Lock()


def local_only(request: Request) -> None:
    if not settings.ENABLE_LLM_SETUP_UI:
        raise HTTPException(404, "Not found")
    if (
        not request.client
        or request.client.host not in {"127.0.0.1", "::1"}
        or request.url.hostname not in {"127.0.0.1", "localhost", "::1"}
    ):
        raise HTTPException(403, "Local development access only")
    origin = request.headers.get("origin")
    own_origin = f"{request.url.scheme}://{request.url.netloc}"
    if (origin and origin != own_origin) or request.headers.get("sec-fetch-site") in {
        "cross-site",
        "same-site",
    }:
        raise HTTPException(403, "Open the setup page directly on this server")
    if request.method != "GET" and not secrets.compare_digest(
        request.headers.get("x-damso-setup", ""), SETUP_TOKEN
    ):
        raise HTTPException(403, "Reload the setup page")


router = APIRouter(
    prefix="/dev/llm",
    tags=["llm-setup"],
    dependencies=[Depends(local_only)],
    include_in_schema=False,
)


@router.get("", response_class=HTMLResponse)
def page() -> HTMLResponse:
    html = (
        (ASSETS / "index.html")
        .read_text(encoding="utf-8")
        .replace("__SETUP_TOKEN__", SETUP_TOKEN)
        .replace("__PROMPT_VERSION__", PROMPT_VERSION)
    )
    return HTMLResponse(
        html,
        headers={
            "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
        },
    )


@router.get("/assets/{name}")
def asset(name: str) -> FileResponse:
    if name not in {"style.css", "app.js"}:
        raise HTTPException(404, "Not found")
    return FileResponse(ASSETS / name)


@router.get("/status")
def status() -> dict[str, Any]:
    return {
        "configured": credential() is not None,
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "stt": "configured" if speech_credential() else "not_configured",
        "stt_model": "CLOVA Speech · 장문 인식",
        "cases": CASES,
    }


@router.get("/prompt", response_class=PlainTextResponse)
def prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


class KeyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: SecretStr


@router.post("/key")
async def register_key(request: Request) -> dict[str, Any]:
    enforce_limit(client_key(request, "llm-key"), limit=5)
    try:
        value = KeyInput.model_validate(await request.json())
        text = value.api_key.get_secret_value()
        if (
            not 16 <= len(text) <= 512
            or not text.isascii()
            or any(c.isspace() or ord(c) < 33 or ord(c) > 126 for c in text)
        ):
            raise ValueError("Invalid key")
    except ValueError, ValidationError, TypeError:
        # FastAPI's default validation detail includes raw input; do not echo a key.
        raise HTTPException(
            422, "키 값만 입력해주세요. 공백이나 Bearer 접두어는 제외합니다."
        ) from None
    try:
        save_credential(value.api_key)
    except OSError:
        raise HTTPException(503, "키 설정 파일을 저장하지 못했습니다.") from None
    return {"configured": True, "model": MODEL, "validated": False}


class TestInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str | None = None
    question: str = ""
    original_text: str = ""
    author_name: str = ""
    summary_style: SummaryStyle = "auto"


@router.post("/speech/key")
async def register_speech_key(request: Request) -> dict[str, Any]:
    enforce_limit(client_key(request, "speech-key"), limit=5)
    try:
        value = SpeechCredential.model_validate(await request.json())
    except ValueError, ValidationError, TypeError:
        raise HTTPException(
            422,
            "장문 인식 도메인의 Secret Key와 공식 Invoke URL을 확인해주세요. URL 뒤에 /recognizer/upload는 붙이지 않습니다.",
        ) from None
    try:
        save_speech_credential(value)
    except OSError:
        raise HTTPException(503, "STT 설정을 저장하지 못했습니다.") from None
    return {"configured": True, "validated": False}


@router.post("/speech/test")
def test_speech_output(
    request: Request,
    file: Annotated[UploadFile, File()],
    question: Annotated[str, Form(max_length=500)] = "오늘 기억에 남는 일이 있었나요?",
    summary_style: Annotated[SummaryStyle, Form()] = "auto",
) -> dict[str, Any]:
    enforce_limit(client_key(request, "speech-test"), limit=5, seconds=300)
    speech, llm = configured_speech_provider(), configured_provider()
    if not speech or not llm:
        raise HTTPException(409, "먼저 CLOVA Speech와 HCX-007 키를 등록해주세요.")
    if not TEST_LOCK.acquire(blocking=False):
        raise HTTPException(409, "앞선 테스트가 진행 중입니다.")
    try:
        root = settings.STORAGE_ROOT.parent / "setup-tests"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            audio = Path(directory) / "recording.bin"
            size = 0
            with audio.open("xb") as target:
                while chunk := file.file.read(64 * 1024):
                    size += len(chunk)
                    if size > settings.MAX_AUDIO_BYTES:
                        raise HTTPException(
                            413, "음성 파일은 25 MiB 이내로 선택해주세요."
                        )
                    target.write(chunk)
            transcript = speech.transcribe(audio, language="ko")
            result = llm.organize(
                question=question, original_text=transcript, summary_style=summary_style
            )
        return {
            "transcript": transcript,
            "output": result.model_dump(),
            "prompt_version": PROMPT_VERSION,
            "saved_to_library": False,
        }
    except ProviderError as exc:
        raise HTTPException(502, {"code": exc.code}) from None
    finally:
        file.file.close()
        TEST_LOCK.release()


@router.post("/test")
async def test_output(request: Request) -> dict[str, Any]:
    enforce_limit(client_key(request, "llm-test"), limit=20, seconds=300)
    try:
        body = TestInput.model_validate(await request.json())
    except ValueError, ValidationError, TypeError:
        raise HTTPException(422, "테스트 입력을 확인해주세요.") from None
    example = next((c for c in CASES if c["id"] == body.case_id), None)
    if body.case_id and not example:
        raise HTTPException(422, "Unknown test case")
    question = example["question"] if example else body.question
    source = example["original_text"] if example else body.original_text
    author_name = example["author_name"] if example else body.author_name
    if (
        not source.strip()
        or len(source) > 20000
        or len(question) > 500
        or len(author_name) > 255
    ):
        raise HTTPException(
            422, "이름은 255자, 질문은 500자, 답변은 20,000자 이내로 입력해주세요."
        )
    provider = configured_provider()
    if not provider:
        raise HTTPException(409, "먼저 API 키를 등록해주세요.")
    if not TEST_LOCK.acquire(blocking=False):
        raise HTTPException(409, "앞선 테스트가 진행 중입니다.")
    try:
        result = await run_in_threadpool(
            provider.organize,
            question=question,
            original_text=source,
            author_name=author_name,
            summary_style=body.summary_style,
        )
    except ProviderError as exc:
        raise HTTPException(502, {"code": exc.code}) from None
    finally:
        TEST_LOCK.release()
    return {
        "case_id": body.case_id,
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "output": result.model_dump(),
        "schema_valid": True,
    }
