"""Only server-owned style instructions may be placed in the system prompt."""

from typing import Literal

SummaryStyle = Literal["auto", "diary"]
STYLE_INSTRUCTIONS: dict[str, str] = {
    "auto": "내 말투 살리기: original_text의 종결어미와 표현을 기준으로 작성자 관점의 1인칭 말투를 유지한다. 존댓말·반말·회상형(…했지, …하더라 등)을 원문에 맞춘다. 반복과 말버릇은 줄이되 개인적인 표현은 적절히 남긴다. 말투가 섞이거나 짧아 판단하기 어려우면 편안한 해요체를 쓴다. 음성·억양·목소리의 감정을 분석했다고 주장하지 않는다. 문체 추론을 이유로 원문에 없는 감정·반응·사실을 덧붙이지 않는다.",
    "diary": "담백한 1인칭 일기체. '…했다', '…였다'로 끝낸다. 예: 첫 월급으로 어머니께 내복을 사드렸다.",
}
