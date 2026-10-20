import io
import json
import logging
import wave
from email import policy
from email.parser import BytesParser

import av
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes import llm_setup
from app.core.config import settings
from app.llm import HCXProvider, ProviderError, provider_status, save_credential
from app.main import app
from app.processing import process_one
from app.speech import (
    ClovaSpeechProvider,
    SpeechCredential,
    credential,
    wav_for_speech,
)
from app.speech import (
    save_credential as save_speech_credential,
)
from integration.test_flows import API, draft, pair, submit, upload, wav_file
from integration.test_llm import KEY, response

URL = "https://clovaspeech-gw.ncloud.com/external/v1/1234/synthetic-invoke-key-not-real"
SECRET = "synthetic-speech-secret-key-not-real"
CONFIG = SpeechCredential(secret_key=SECRET, invoke_url=URL)


def audio_path(tmp_path):
    path = tmp_path / "recording.bin"
    path.write_bytes(wav_file())
    return path


def test_speech_request_uploads_wav_and_keeps_credentials_out_of_logs(tmp_path, caplog):
    def handler(request):
        assert str(request.url) == URL + "/recognizer/upload"
        assert request.headers["x-clovaspeech-api-key"] == SECRET
        multipart = BytesParser(policy=policy.default).parsebytes(
            b"Content-Type: "
            + request.headers["content-type"].encode()
            + b"\r\n\r\n"
            + request.content
        )
        parts = {
            part.get_param("name", header="content-disposition"): part.get_payload(
                decode=True
            )
            for part in multipart.iter_parts()
        }
        params = json.loads(parts["params"])
        assert params["completion"] == "sync" and params["language"] == "ko-KR"
        assert (
            params["diarization"] == {"enable": False} and not params["sed"]["enable"]
        )
        with wave.open(io.BytesIO(parts["media"])) as recording:
            assert (
                recording.getframerate(),
                recording.getnchannels(),
                recording.getsampwidth(),
            ) == (16000, 1, 2)
            assert recording.getnframes() == 1600
        assert SECRET.encode() not in request.content
        return httpx.Response(
            200, json={"result": "COMPLETED", "text": " 어머니와 시장에 갔어요. "}
        )

    caplog.set_level(logging.INFO, logger="httpx")
    result = ClovaSpeechProvider(
        CONFIG, transport=httpx.MockTransport(handler)
    ).transcribe(audio_path(tmp_path), language="ko")
    assert result == "어머니와 시장에 갔어요."
    assert (
        SECRET not in caplog.text and "synthetic-invoke-key-not-real" not in caplog.text
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/private",
        URL + "?redirect=x",
        URL + "/recognizer/upload",
        URL.replace(".com", ".com.attacker.example"),
        "https://user:pass@clovaspeech-gw.ncloud.com/external/v1/1/invoke-key",
    ],
)
def test_speech_credentials_accept_only_official_domain_url(url):
    with pytest.raises(ValidationError):
        SpeechCredential(secret_key=SECRET, invoke_url=url)


def test_audio_conversion_accepts_webm_and_enforces_decoded_duration(
    tmp_path, monkeypatch
):
    encoded = io.BytesIO()
    with (
        av.open(io.BytesIO(wav_file())) as original,
        av.open(encoded, "w", format="webm") as output,
    ):
        stream = output.add_stream("libopus", rate=48000)
        stream.layout = "mono"
        for frame in original.decode(audio=0):
            for packet in stream.encode(frame):
                output.mux(packet)
        for packet in stream.encode(None):
            output.mux(packet)
    path = tmp_path / "recording.bin"
    path.write_bytes(encoded.getvalue())
    converted = wav_for_speech(path)
    with wave.open(io.BytesIO(converted)) as recording:
        assert recording.getframerate() == 16000 and recording.getnframes() > 0
    monkeypatch.setattr(settings, "MAX_AUDIO_SECONDS", 0)
    with pytest.raises(ProviderError, match="AUDIO_TOO_LONG"):
        wav_for_speech(path)
    path.write_bytes(b"not audio")
    with pytest.raises(ProviderError, match="INVALID_AUDIO"):
        wav_for_speech(path)


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (401, "AUTH_FAILED"),
        (403, "ACCESS_DENIED"),
        (429, "RATE_LIMITED"),
        (500, "PROVIDER_UNAVAILABLE"),
        (302, "REQUEST_REJECTED"),
    ],
)
def test_speech_errors_are_sanitized_and_redirects_not_followed(tmp_path, status, code):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            status, text=SECRET + URL, headers={"Location": "http://127.0.0.1/"}
        )

    with pytest.raises(ProviderError, match=code):
        ClovaSpeechProvider(CONFIG, transport=httpx.MockTransport(handler)).transcribe(
            audio_path(tmp_path), language="ko"
        )
    assert len(calls) == 1


@pytest.mark.parametrize(
    ("data", "code"),
    [
        ({"result": "SUCCEEDED", "text": "대기"}, "INCOMPLETE_OUTPUT"),
        ({"result": "COMPLETED", "text": " "}, "NO_SPEECH"),
        ({"result": "COMPLETED", "text": 123}, "INVALID_PROVIDER_OUTPUT"),
        ({"result": "COMPLETED", "text": "a" * 20001}, "INVALID_PROVIDER_OUTPUT"),
    ],
)
def test_unusable_transcript_is_not_accepted(tmp_path, data, code):
    with pytest.raises(ProviderError, match=code):
        ClovaSpeechProvider(
            CONFIG,
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json=data)),
        ).transcribe(audio_path(tmp_path), language="ko")


def test_stt_success_queues_llm_and_only_confirmed_summary_reaches_library(client):
    parent, child = pair(client)
    save_speech_credential(CONFIG)
    save_credential(KEY)
    asset = upload(client, parent)
    answer = draft(client, parent, audio_id=asset["id"])
    transcript = "첫 월급으로 어머니께 내복을 사드렸어요."
    summary = "첫 월급으로 어머니께 내복을 사드렸다고 해요."
    assert provider_status() == {"stt": "configured", "llm": "configured"}
    speech = ClovaSpeechProvider(
        CONFIG,
        transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200, json={"result": "COMPLETED", "text": transcript}
            )
        ),
    )
    assert process_one(stt=speech)
    state = client.get(
        f"{API}/answers/{answer['id']}/processing", headers=parent["headers"]
    ).json()
    assert [(j["kind"], j["status"]) for j in state["jobs"]] == [
        ("stt", "succeeded"),
        ("llm", "queued"),
    ]

    def handler(request):
        data = json.loads(json.loads(request.content)["messages"][1]["content"])
        assert data["original_text"] == transcript
        return response(
            {"summary": summary, "follow_up_question": "어떤 말씀을 하셨나요?"}
        )

    assert process_one(llm=HCXProvider(KEY, transport=httpx.MockTransport(handler)))
    private = client.get(
        f"{API}/answers/{answer['id']}", headers=parent["headers"]
    ).json()
    assert private["transcript"] == transcript and private["summary_draft"] == summary
    assert (
        client.get(
            f"{API}/answers/{answer['id']}", headers=child["headers"]
        ).status_code
        == 404
    )
    submit(client, parent, answer)
    story = client.get(f"{API}/library/{answer['id']}", headers=child["headers"]).json()
    assert story["text"] == summary and "transcript" not in story
    assert (settings.STORAGE_ROOT / f"{asset['id']}.bin").read_bytes() == wav_file()


def test_no_speech_stops_chain_without_fabricated_summary(client):
    parent, _ = pair(client)
    asset = upload(client, parent)
    answer = draft(client, parent, audio_id=asset["id"])
    speech = ClovaSpeechProvider(
        CONFIG,
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"result": "COMPLETED", "text": ""})
        ),
    )
    assert process_one(stt=speech)
    state = client.get(
        f"{API}/answers/{answer['id']}/processing", headers=parent["headers"]
    ).json()
    assert len(state["jobs"]) == 1 and state["jobs"][0]["error_code"] == "NO_SPEECH"
    private = client.get(
        f"{API}/answers/{answer['id']}", headers=parent["headers"]
    ).json()
    assert private["transcript"] is None and private["summary_draft"] is None


def test_setup_registers_separate_speech_secret_without_echo_and_tests_audio(
    monkeypatch,
):
    monkeypatch.setattr(settings, "ENABLE_LLM_SETUP_UI", True)
    with TestClient(
        app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 100)
    ) as local:
        path = "/dev/llm/speech/key"
        headers = {
            "X-Damso-Setup": llm_setup.SETUP_TOKEN,
            "Origin": "http://127.0.0.1:8000",
        }
        body = {"secret_key": SECRET, "invoke_url": URL}
        assert local.post(path, json=body).status_code == 403
        rejected = local.post(path, headers=headers, json={**body, "unexpected": True})
        assert (
            rejected.status_code == 422
            and SECRET not in rejected.text
            and URL not in rejected.text
        )
        saved = local.post(path, headers=headers, json=body)
        assert (
            saved.status_code == 200
            and SECRET not in saved.text
            and URL not in saved.text
        )
        status = local.get("/dev/llm/status")
        assert status.json()["stt"] == "configured" and URL not in status.text
        assert credential() is not None
        monkeypatch.setattr(
            llm_setup,
            "configured_speech_provider",
            lambda: ClovaSpeechProvider(
                CONFIG,
                transport=httpx.MockTransport(
                    lambda _: httpx.Response(
                        200,
                        json={
                            "result": "COMPLETED",
                            "text": "어머니께 내복을 사드렸어요.",
                        },
                    )
                ),
            ),
        )
        monkeypatch.setattr(
            llm_setup,
            "configured_provider",
            lambda: HCXProvider(
                KEY, transport=httpx.MockTransport(lambda _: response())
            ),
        )
        tested = local.post(
            "/dev/llm/speech/test",
            headers=headers,
            files={"file": ("recording.wav", wav_file(), "audio/wav")},
        )
        assert tested.status_code == 200 and tested.json()["saved_to_library"] is False
        assert tested.json()["transcript"] == "어머니께 내복을 사드렸어요."
        assert not list((settings.STORAGE_ROOT.parent / "setup-tests").glob("*"))
