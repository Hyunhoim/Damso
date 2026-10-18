# 담소 백엔드 실행·운영 안내

FastAPI + PostgreSQL 기반 앱 서버입니다. 공식 Full Stack FastAPI Template의 인증·DB·마이그레이션 구조를 바탕으로 담소 기능을 추가했습니다. React 웹 프론트엔드는 가져오지 않았습니다. 원본 정보는 [UPSTREAM.md](UPSTREAM.md), 라이선스는 [LICENSE](LICENSE)를 참고하세요.

## 구현 범위

| 영역 | 동작 |
| --- | --- |
| 계정 | 이메일 가입, 부모/자녀 역할, Argon2 암호화, 로그인, 토큰 갱신, 현재/전체 기기 로그아웃, 비밀번호 변경, 탈퇴 |
| 가족 | 부모 1명 + 자녀 1명, 6자리 코드, 30분 만료, 재발급 시 이전 코드 무효화, 상대 확인, 연결 해제 |
| 질문 | 한국 시간 기준 역할별 일일 질문, 부모가 자녀에게 보내는 개별 질문, 미답변 개별 질문 취소 |
| 답변 | 글·음성 초안, 수정, 제출, 삭제. 제출하면 상대가 답하지 않아도 즉시 공개 |
| 기억의 서재 | 날짜·역할별 조회, 페이지 구분, 댓글, 공감. 2D/3D 화면은 같은 기록 API 사용 |
| 음성 | 오디오 형식 검사, 비공개 파일 저장, 권한 검사 후 재생·구간 요청, 삭제 |
| 설정 | 이름, 글자 크기 1.0~1.5, 알림 사용 여부, 알림 시간 저장 |
| 알림 | 가족 연결·질문·기록·댓글·공감의 앱 내부 알림, 읽음 처리 |
| STT·LLM | 제공자 인터페이스, DB 작업 큐, 상태 조회, 재시도, 원문·전사·요약 초안 분리 |

**STT·LLM 모델은 연결하지 않았습니다.** 작업은 `waiting_provider`로 저장되며 API 비용이 발생하지 않습니다. 모델 결과를 흉내 내지 않습니다. TTS·음성 클로닝, 푸시 및 예약 알림 발송은 아직 구현하지 않았습니다. 알림 시간은 설정값만 저장합니다. 기존 Expo 화면도 아직 이 API에 연결하지 않았습니다.

## Windows 실행

Python **3.14 이상**, `uv`가 필요합니다. 현재 작업 환경에는 `.venv`와 프로젝트 내부 Python 런타임을 준비해 두었습니다.

```powershell
cd damso-server/backend
uv sync --python 3.14
.venv/Scripts/python.exe -X utf8 scripts/run-local.py
```

의존성이 이미 설치되어 있으면 마지막 명령만 실행하세요. 설정 파일 최초 생성 → 로컬 PostgreSQL 시작 → 마이그레이션 → 관리자·기본 질문 생성 → API 실행 순서로 진행합니다. 설정 파일과 기존 계정·질문을 덮어쓰지 않습니다.

- API 문서: <http://127.0.0.1:8000/docs>
- 생존 확인: <http://127.0.0.1:8000/health/live>
- 실제 DB 연결 확인: <http://127.0.0.1:8000/health/ready>
- API 요청 순서: [API_CONTRACT.md](API_CONTRACT.md)

PostgreSQL 18.6은 `127.0.0.1:5433`에서 동작합니다. 개발 DB는 `app`, 별도 테스트 DB는 `damso_test`입니다. 공식 EDB Windows 바이너리를 `tmp/postgresql/`에 준비하며 시스템 서비스·전역 DB를 설치하지 않습니다. 한글 경로 문제를 피하려고 임시 폴더에 프로젝트를 가리키는 junction을 만들지만, 실제 데이터는 `backend/data/postgres/`에 저장합니다.

`Ctrl+C`는 API만 종료합니다. DB 종료 전 API를 종료하세요.

```powershell
.venv/Scripts/python.exe -X utf8 scripts/postgres-local.py status
.venv/Scripts/python.exe -X utf8 scripts/postgres-local.py stop
```

## 설정과 데이터

`backend/.env.local`은 DB·JWT·관리자 설정입니다. 상위 `damso-server/.env.local`의 기존 AI 키 파일과 별개이며 해당 파일을 읽거나 덮어쓰지 않습니다. 두 파일 모두 Git 추적 대상에서 제외합니다.

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 주소. 로컬 도우미는 `postgres@127.0.0.1:5433/app`만 지원 |
| `SECRET_KEY` | JWT 서명·코드·토큰 해시 키. 변경 시 기존 로그인과 연결 코드 사용 불가 |
| `FIRST_SUPERUSER`, `FIRST_SUPERUSER_PASSWORD` | 최초 관리자 생성. 기존 계정 비밀번호를 자동 변경하지 않음 |
| `FRONTEND_HOST` | 기본 브라우저 허용 주소. 기본 `http://localhost:8081` |
| `BACKEND_CORS_ORIGINS` | 추가 허용 주소 JSON 배열. 기본 `["http://127.0.0.1:8081"]` |
| `STORAGE_ROOT` | 비공개 음성 경로. 기본 `backend/data/audio/` |
| `MAX_AUDIO_BYTES` | 파일 한도. 기본 25 MiB |
| `MAX_AUDIO_SECONDS` | 파일에서 길이 판독이 가능한 경우 적용하는 한도. 기본 600초 |
| `SMTP_*`, `EMAILS_FROM_EMAIL` | 선택 사항. 미설정 시 비밀번호 복구 요청은 503 |

로그인·코드 추측·업로드 등에 PostgreSQL 기반 요청 제한을 적용합니다. 일반 본문은 1 MiB, 업로드 본문은 파일 한도 + 1 MiB로 제한합니다. WAV, MP3, M4A/MP4, WebM/Matroska, Ogg, FLAC을 검사하며 비디오·재생 목록·외부 URL 참조를 허용하지 않습니다. 길이 정보가 없는 음성에도 파일 크기 제한은 항상 적용합니다.

- 초안, 수정 전 원문, 전사문, AI 요약 초안은 작성자만 조회합니다.
- `/submit`에서 확정한 글만 공개합니다. 원본 음성은 `share_audio: true`를 명시해야 공유합니다. 글에서 지운 부분이 음성으로 노출되는 것을 방지하기 위한 구분입니다.
- AI는 원문을 덮어쓰거나 자동 제출하지 않습니다. 요약 공개 시 작성자가 확인하고 `/submit`의 `text`에 선택한 글을 보냅니다.
- 연결 해제 후 각자 본인 기록을 보관합니다. 이전 상대·새 상대에게 과거 연결 기록을 공개하지 않습니다.
- 제출한 본문은 조용히 덮어쓸 수 없습니다. 삭제 후 다시 작성합니다. 답변 삭제 후 연결되지 않은 음성도 별도로 삭제할 수 있습니다. 탈퇴하면 본인 음성 파일도 제거합니다.
- 날짜는 `Asia/Seoul`, DB 시각은 UTC입니다. 기본 질문은 부모 10개·자녀 10개를 순환합니다. 서비스 질문 수는 콘텐츠 기획에 맞춰 늘리세요.

## STT·LLM 연결

`app/processing.py`의 `STTProvider.transcribe()`와 `LLMProvider.organize()`를 구현해 `process_one(stt=..., llm=...)`에 전달합니다. 현재 기본 제공자는 없으며 `python -m app.worker`는 이를 알리고 종료합니다. 모델 결정 후 실제 워커의 반복 실행·SDK·시간 제한·비용 정책을 연결해야 합니다.

음성 답변 → STT 작업 → 전사 성공 → LLM 작업 순서입니다. 글이 명시된 답변은 해당 글을 LLM 입력으로 사용합니다. LLM은 `summary`와 선택적 단일 `follow_up_question`만 반환해야 합니다. 서버가 필드·타입·길이를 검증하고 잘못된 결과는 원문을 보존한 채 실패로 기록합니다. 실패 작업은 최대 3회 시도합니다. 원문 수정 시 revision을 올리고 이전 대기 작업을 폐기합니다.

실제 어댑터에서는 고정 지시와 원문 입력을 분리하고 네트워크 시간 제한을 지정해야 합니다. 현재 스키마 검증만으로 프롬프트 인젝션 방어가 완료된 것은 아닙니다. 제공자에 도구 실행·DB 권한을 주지 않는 구조를 유지하세요.

## Docker와 외부 배포

```powershell
cd damso-server
docker compose --env-file backend/.env.local -f compose.backend.yml up --build -d
```

DB 준비 → 마이그레이션·시드 → API 순서로 실행하며 DB·음성을 각각 영속 볼륨에 저장합니다. **현재 PC에는 Docker가 없어 이미지 빌드·Compose 실행은 검증하지 않았습니다.** 네이티브 DB와 같은 5433 포트를 사용하므로 동시에 실행하지 마세요. 데이터 저장소도 서로 별개입니다.

외부 배포에는 HTTPS 프록시, 실제 프론트 주소, 별도 저장 볼륨과 앱 전용 DB 계정을 설정하세요. 로컬 postgres 슈퍼유저는 개발용입니다. 전달 헤더를 신뢰할 프록시 IP도 제한해야 IP별 요청 제한이 올바르게 동작합니다. 현재 로컬 실행은 proxy headers를 비활성화합니다.

백업은 DB와 음성 디렉터리, 비밀 설정 파일을 함께 보관해야 합니다. API를 중지한 상태에서 `pg_dump -Fc`와 음성 디렉터리 복사로 같은 시점의 백업을 남기고, 별도 DB에서 복원을 먼저 검증하세요. `data/postgres` 삭제 또는 `docker compose down -v`는 데이터 삭제를 의미합니다.

## 검증·유지관리

```powershell
cd damso-server/backend
.venv/Scripts/python.exe -X utf8 scripts/test-backend.py
.venv/Scripts/ruff.exe check app integration checks
.venv/Scripts/ruff.exe format app integration checks --check
.venv/Scripts/mypy.exe app
.venv/Scripts/ty.exe check app
.venv/Scripts/python.exe -X utf8 -m alembic check
.venv/Scripts/python.exe -X utf8 -m app.maintenance
```

테스트는 `damso_test`만 초기화합니다. 원본 템플릿의 `tests/`는 현재 정책과 다른 과거 테스트이므로 직접 실행하지 마세요. 만료 세션·코드·요청 제한 기록은 `app.maintenance`로 정리합니다. 이 명령은 사용자·이야기·음성을 지우지 않습니다.
