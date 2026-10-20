"""CLOVA Speech long-form upload adapter; credentials never enter model prompts."""

import io
import json
import logging
import os
import re
import secrets
import time
import wave
from pathlib import Path

import av
import httpx
from pydantic import BaseModel, ConfigDict, SecretStr, field_validator

from app.core.config import settings
from app.llm import ProviderError

INVOKE_URL_PATTERN = (
    r"https://clovaspeech-gw\.ncloud\.com/external/v1/[0-9]+/[A-Za-z0-9_-]{8,256}"
)


class _HideSpeechURL(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if "clovaspeech-gw.ncloud.com" in record.getMessage():
            record.msg = "CLOVA Speech HTTP request completed (private URL omitted)"
            record.args = ()
        return True


# HTTPX INFO logs normally include the URL, whose path contains the Invoke Key.
logging.getLogger("httpx").addFilter(_HideSpeechURL())


class SpeechCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")
    secret_key: SecretStr
    invoke_url: SecretStr

    @field_validator("invoke_url")
    @classmethod
    def official_url(cls, value: SecretStr) -> SecretStr:
        text = value.get_secret_value().strip().rstrip("/")
        if not re.fullmatch(INVOKE_URL_PATTERN, text):
            raise ValueError("Use the official long-form domain Invoke URL")
        return SecretStr(text)

    @field_validator("secret_key")
    @classmethod
    def key_format(cls, value: SecretStr) -> SecretStr:
        text = value.get_secret_value()
        if not 16 <= len(text) <= 512 or not all(33 <= ord(c) <= 126 for c in text):
            raise ValueError("Invalid Speech secret key")
        return value


def credential() -> SpeechCredential | None:
    try:
        raw = settings.CLOVA_SPEECH_CONFIG_FILE.read_bytes()
        if len(raw) > 4096:
            return None
        return SpeechCredential.model_validate_json(raw)
    except OSError, ValueError:
        return None


def save_credential(value: SpeechCredential) -> None:
    target = settings.CLOVA_SPEECH_CONFIG_FILE
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    staged = target.with_name(f".{target.name}.{secrets.token_hex(8)}.tmp")
    try:
        fd = os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "secret_key": value.secret_key.get_secret_value(),
                    "invoke_url": value.invoke_url.get_secret_value(),
                },
                handle,
            )
        staged.replace(target)
    finally:
        staged.unlink(missing_ok=True)


def wav_for_speech(audio: Path) -> bytes:
    """Decode bounded local audio, including WebM/Opus, to 16 kHz mono PCM WAV."""
    started = time.monotonic()
    content = io.BytesIO()
    try:
        if not 0 < audio.stat().st_size <= settings.MAX_AUDIO_BYTES:
            raise ProviderError("INVALID_AUDIO")
        with (
            av.open(
                str(audio),
                options={
                    "protocol_whitelist": "file,pipe",
                    "format_whitelist": "wav,mp3,mov,matroska,webm,ogg,flac",
                },
            ) as source,
            wave.open(content, "wb") as target,
        ):
            if not source.streams.audio or source.streams.video:
                raise ProviderError("INVALID_AUDIO")
            target.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
            samples = 0

            def write(frame: av.AudioFrame) -> None:
                nonlocal samples
                samples += frame.samples
                if samples > 16000 * settings.MAX_AUDIO_SECONDS:
                    raise ProviderError("AUDIO_TOO_LONG")
                if time.monotonic() - started > 20:
                    raise ProviderError("AUDIO_DECODE_TIMEOUT")
                target.writeframesraw(bytes(frame.planes[0])[: frame.samples * 2])

            for original in source.decode(audio=0):
                for frame in resampler.resample(original):
                    write(frame)
            for frame in resampler.resample(None):
                write(frame)
            if not samples:
                raise ProviderError("INVALID_AUDIO")
    except OSError, ValueError, av.error.FFmpegError:
        raise ProviderError("INVALID_AUDIO") from None
    return content.getvalue()


class ClovaSpeechProvider:
    def __init__(
        self, config: SpeechCredential, *, transport: httpx.BaseTransport | None = None
    ) -> None:
        self.config = config
        self.transport = transport

    def transcribe(self, audio: Path, *, language: str) -> str:
        if language not in {"ko", "ko-KR"}:
            raise ProviderError("INVALID_INPUT")
        recording = wav_for_speech(audio)
        params = {
            "language": "ko-KR",
            "completion": "sync",
            "fullText": True,
            "wordAlignment": False,
            "diarization": {"enable": False},
            "sed": {"enable": False},
            "resultToObs": False,
        }
        try:
            with httpx.Client(
                timeout=httpx.Timeout(120, connect=10, write=15, pool=5),
                follow_redirects=False,
                trust_env=False,
                transport=self.transport,
            ) as client:
                started = time.monotonic()
                with client.stream(
                    "POST",
                    self.config.invoke_url.get_secret_value() + "/recognizer/upload",
                    headers={
                        "X-CLOVASPEECH-API-KEY": self.config.secret_key.get_secret_value(),
                        "Accept": "application/json",
                    },
                    data={"params": json.dumps(params)},
                    files={"media": ("recording.wav", recording, "audio/wav")},
                ) as response:
                    if response.status_code != 200:
                        raise ProviderError(
                            {
                                401: "AUTH_FAILED",
                                403: "ACCESS_DENIED",
                                429: "RATE_LIMITED",
                            }.get(
                                response.status_code,
                                "PROVIDER_UNAVAILABLE"
                                if response.status_code >= 500
                                else "REQUEST_REJECTED",
                            )
                        )
                    raw = bytearray()
                    for chunk in response.iter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 1024 * 1024 or time.monotonic() - started > 135:
                            raise ProviderError("RESPONSE_LIMIT")
                    data = json.loads(raw)
            if data.get("result") != "COMPLETED":
                raise ProviderError("INCOMPLETE_OUTPUT")
            text = data["text"]
            if not isinstance(text, str) or len(text) > 20000:
                raise ProviderError("INVALID_PROVIDER_OUTPUT")
            if not text.strip():
                raise ProviderError("NO_SPEECH")
            return text.strip()
        except httpx.TimeoutException:
            raise ProviderError("PROVIDER_TIMEOUT") from None
        except httpx.HTTPError:
            raise ProviderError("PROVIDER_UNAVAILABLE") from None
        except ValueError, KeyError, TypeError, AttributeError:
            raise ProviderError("INVALID_PROVIDER_OUTPUT") from None


def configured_provider() -> ClovaSpeechProvider | None:
    config = credential()
    return ClovaSpeechProvider(config) if config else None
