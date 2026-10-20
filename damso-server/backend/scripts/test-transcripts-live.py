"""Three real HCX calls on randomly selected synthetic transcripts, no STT call."""

import json
import random
import secrets
from datetime import UTC, datetime
from pathlib import Path

from app.llm import MODEL, PROMPT_VERSION, ProviderError, configured_provider

CASES = [
    (
        "시장에 다녀온 이야기",
        "오늘 기억에 남는 일이 있었나요?",
        "오늘 시장에서 사과 다섯 개를 샀어요. 집에 오는 길에 이웃 수진 씨를 만났는데 같이 차를 마시지는 않았어요.",
    ),
    (
        "사투리로 남긴 추억",
        "어릴 때 즐겨 먹던 음식은 무엇인가요?",
        "어릴 적에는 어무이가 끓여준 수제비가 좋았지예. 비 오는 날이면 동생이랑 둘이 먹었어요. 아버지는 그날 집에 안 계셨어요.",
    ),
    (
        "기억이 불확실한 경험",
        "가족과 함께한 여행이 기억나시나요?",
        "부산 바다에 아들이랑 갔어요. 기차로 갔는지 버스로 갔는지는 잘 기억이 안 나요. 바닷가에서 국수를 먹은 건 기억나요.",
    ),
    (
        "자녀의 발표",
        "오늘 어떤 일이 있었나요?",
        "회사에서 처음 발표를 맡았어요. 긴장했지만 끝까지 했고 동료가 목소리가 잘 들렸다고 했어요. 엄마한테는 아직 말하지 않았어요.",
    ),
    (
        "원하는 선물을 못 드린 경험",
        "첫 월급으로 무엇을 하셨나요?",
        "첫 월급을 받았을 때 아버지 구두를 사드리고 싶었는데 돈이 부족해서 못 샀어요. 대신 저녁을 같이 먹었어요.",
    ),
    (
        "대화 중단",
        "오늘 하루는 어떠셨나요?",
        "집에서 책을 조금 읽었어요. 오늘은 더 이야기하고 싶지 않아요.",
    ),
    (
        "자녀의 음식 이야기",
        "오늘 먹은 음식 중 기억에 남는 것은 무엇인가요?",
        "점심에 김치볶음밥을 먹었어요. 아버지가 해주시던 맛이랑은 좀 달랐어요. 주말에는 제가 직접 만들어 보려고 해요.",
    ),
    (
        "가족과 통화한 일상",
        "오늘 가족과 나눈 이야기가 있나요?",
        "딸하고 십 분쯤 전화했어요. 새로 이사한 집 이야기를 들었는데 주소는 아직 몰라요. 다음 달에 사진을 보내준다고 했어요.",
    ),
]


def main() -> None:
    provider = configured_provider()
    if provider is None:
        raise SystemExit("HCX key missing; no API called")
    seed = secrets.randbits(32)
    results = []
    for label, question, source in random.Random(seed).sample(CASES, 3):
        try:
            output = provider.organize(question=question, original_text=source)
        except ProviderError as exc:
            raise SystemExit(f"Stopped: {exc.code}") from None
        item = {
            "label": label,
            "question": question,
            "original_text": source,
            "output": output.model_dump(),
            "schema_valid": True,
        }
        results.append(item)
        print(json.dumps(item, ensure_ascii=False), flush=True)  # noqa: T201
    backend = Path(__file__).resolve().parents[1]
    target = backend / "data/llm-tests"
    target.mkdir(parents=True, exist_ok=True)
    report = {
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "seed": seed,
        "synthetic_text_only": True,
        "speech_api_called": False,
        "results": results,
    }
    path = target / (datetime.now(UTC).strftime("%Y%m%dT%H%M%S") + "-transcripts.json")
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# STT 연동과 합성 전사문 LLM 실호출",
        "",
        "검증일: 2026-10-20 · HCX-007 · " + PROMPT_VERSION,
        "",
        "아래는 합성 전사문 8개 중 무작위로 고른 3개를 실제 HCX API에 보낸 결과입니다. 실제 음성을 전사한 결과가 아니며 CLOVA Speech API는 호출하지 않았습니다. 요약과 질문은 모델의 원문 출력입니다.",
        "",
    ]
    for item in results:
        value = item["output"]
        lines.extend(
            [
                "## " + item["label"],
                "",
                "질문: " + item["question"],
                "",
                "입력: " + item["original_text"],
                "",
                "> " + value["summary"],
                "",
                "꼬리질문: " + (value["follow_up_question"] or "없음"),
                "",
            ]
        )
    lines.extend(
        [
            "세 응답 모두 서버의 JSON 형식 검증을 통과했습니다. 의미 정확성과 원문 보존은 별도 검토 대상이며 이 소수 사례는 정확도 평가가 아닙니다.",
            "",
            "원본 JSON (Git 제외): `"
            + str(path.relative_to(backend)).replace("\\", "/")
            + "`",
            "",
        ]
    )
    (backend / "STT_LLM_TEST_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    print("Saved:", path, flush=True)  # noqa: T201


if __name__ == "__main__":
    main()
