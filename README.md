# 담소 (Damso)

부모와 자녀가 역할별 질문에 답하고 서로의 이야기를 기록하는 가족 소통 앱입니다.

## 현재 구현 범위

| 구분 | 구현 내용 |
| --- | --- |
| 모바일 화면 | React Native·Expo 기반 부모/자녀 홈, 마이크 인터랙션, 글 답변, 2D 기억의 서재, 이야기 상세, 글자 크기·역할 설정 |
| 3D 서재 | 기존 Three.js·Blender 에셋 연결, 로딩·오류·재시도·2D 복귀 처리 |
| 계정 API | 회원가입, 로그인, 토큰 갱신, 로그아웃, 비밀번호 변경, 탈퇴 |
| 가족 API | 부모 1명·자녀 1명 연결, 6자리 코드 발급·확인·만료·재발급, 연결 해제 |
| 질문·답변 API | 역할별 일일 질문, 부모가 자녀에게 보내는 개별 질문, 글·음성 답변 초안·수정·제출·삭제 |
| 서재 API | 날짜·역할별 기록 조회, 댓글, 공감, 앱 내부 알림, 사용자 설정 저장 |
| DB·파일 | PostgreSQL 스키마·마이그레이션, 기본 질문 20개, 비공개 음성 업로드·재생·삭제와 권한 검사 |
| AI 연결 준비 | STT·LLM 제공자 인터페이스, 처리 작업 저장·상태 조회·재시도, 원문과 요약 초안 분리 |

답변은 작성자가 제출하면 상대의 답변 여부와 관계없이 즉시 공개합니다. 초안·수정 전 원문·AI 초안은 작성자만 조회하며, 원본 음성은 공유를 명시한 경우에만 상대에게 공개합니다.

## 아직 연결하지 않은 부분

- 모바일 화면과 백엔드 API 연결: 현재 프론트의 글 답변은 메모리에 저장되어 새로고침하면 초기화됩니다.
- 실제 마이크 녹음·STT·LLM 모델 호출: 서버의 AI 작업은 `waiting_provider` 상태로 보관합니다.
- TTS·음성 클로닝, 푸시·예약 알림 발송.
- 2D 기록과 3D 장면의 데이터 동기화. 3D에는 기존 예시 콘텐츠가 표시됩니다.

## 프로젝트 구조

```text
damso-mobile/   Expo · React Native · TypeScript 앱
damso-library/  React · Three.js 3D 서재
damso-server/   FastAPI · SQLModel · PostgreSQL 서버
scripts/       로컬 프론트 미리보기 실행
```

## 실행 안내

- [모바일·3D 미리보기 실행](damso-mobile/README.md): 각 프론트 폴더에서 `npm ci` 후 `scripts/start-damso-preview.ps1` 실행. 앱 `http://localhost:8081`, 3D `http://localhost:5174`.
- [백엔드 실행·DB 설정](damso-server/backend/RUNBOOK.md): Python 3.14·uv로 의존성 설치 후 `scripts/run-local.py` 실행. API `http://127.0.0.1:8000/docs`, PostgreSQL `127.0.0.1:5433`.
- [프론트 연결용 API 명세](damso-server/backend/API_CONTRACT.md).

실제 환경변수 파일, DB 데이터, 업로드 음성, 의존성·빌드 결과는 저장소에 포함하지 않습니다. 각 환경의 비밀 설정은 별도로 준비합니다.

## 검증 현황

백엔드 테스트 18개와 키 설정 테스트 2개, Ruff·Mypy·Ty 검사 및 DB 마이그레이션 일치 확인을 통과했습니다. 프론트 검증 방법과 결과는 각 폴더의 README를 참고하세요. 실제 Android/iOS 기기 빌드, Docker 실행과 외부 배포는 검증하지 않았습니다.
