from sqlmodel import Session, select

from app.core.db import engine
from app.domain_models import QuestionBank

QUESTIONS = {
    "parent": [
        "어릴 때 가장 좋아했던 집밥은 무엇이었나요?",
        "첫 월급으로 무엇을 하셨나요?",
        "학창 시절 가장 기억에 남는 친구는 누구인가요?",
        "자녀가 어릴 때 함께했던 일 중 떠오르는 기억이 있나요?",
        "처음 살던 집은 어떤 모습이었나요?",
        "젊었을 때 즐겨 듣던 노래는 무엇인가요?",
        "요즘 하루 중 가장 편안한 시간은 언제인가요?",
        "다시 가보고 싶은 여행지가 있나요?",
        "부모님께 배운 것 중 지금도 기억하는 것은 무엇인가요?",
        "오늘 자녀에게 들려주고 싶은 작은 이야기가 있나요?",
    ],
    "child": [
        "오늘 먹은 음식 중 기억에 남는 건 무엇인가요?",
        "오늘 하루 가장 웃었던 순간은 언제였나요?",
        "어릴 때 부모님과 함께했던 일 중 떠오르는 기억이 있나요?",
        "요즘 가장 관심을 두고 있는 일은 무엇인가요?",
        "이번 주말에 해보고 싶은 일이 있나요?",
        "최근 부모님이 생각났던 순간이 있나요?",
        "오늘 나를 도와준 사람은 누구였나요?",
        "요즘 즐겨 듣는 노래를 소개해주세요.",
        "부모님과 함께 가보고 싶은 곳이 있나요?",
        "오늘 부모님께 전하고 싶은 한마디가 있나요?",
    ],
}


def seed() -> None:
    with Session(engine) as session:
        for role, items in QUESTIONS.items():
            for index, text in enumerate(items):
                key = f"{role}-{index:02}"
                if not session.exec(
                    select(QuestionBank).where(QuestionBank.seed_key == key)
                ).first():
                    session.add(QuestionBank(seed_key=key, role=role, text=text))
        session.commit()


if __name__ == "__main__":
    seed()
