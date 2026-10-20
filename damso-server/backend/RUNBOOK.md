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
| STT·LLM | CLOVA Speech 전사, HCX-007 호출·워커, 키 입력·테스트 화면, DB 작업 큐·재시도, 원문·전사·요약 초안 분리 |

**CLOVA Speech 장문 인식과 HCX-007 호출을 구현했습니다.** 제공자별 키가 없으면 해당 작업을 `waiting_provider`로 보관합니다. 등록한 Speech 키로 합성 음성 1건의 실제 STT→HCX 호출을 확인했습니다. 키 등록 후 테스트·대기 작업에서 실제 API 사용량이 발생합니다. TTS·음성 클로닝, 푸시·예약 알림 발송과 기존 Expo 화면의 API 연결은 별도 구현 대상입니다.

## Windows 실행

Python **3.14 이상**, `uv`가 필요합니다. 현재 작업 환경에는 `.venv`와 프로젝트 내부 Python 런타임을 준비해 두었습니다.

```powershell
cd damso-server/backend
uv sync --python 3.14
.venv/Scripts/python.exe -X utf8 scripts/run-local.py
```

의존성이 이미 설치되어 있으면 마지막 명령만 실행하세요. 설정 파일 최초 생성 → PostgreSQL → 마이그레이션 → 관리자·질문 생성 → API와 AI 워커 순서로 실행합니다. 기존 설정·계정·질문은 덮어쓰지 않습니다. 키 파일은 워커가 다시 읽으므로 키 등록 때 재시작할 필요가 없습니다.

- API 문서: <http://127.0.0.1:8000/docs>
- STT·HCX-007 키 등록: <http://127.0.0.1:8000/dev/llm>
- 생존 확인: <http://127.0.0.1:8000/health/live>
- 실제 DB 연결 확인: <http://127.0.0.1:8000/health/ready>
- API 요청 순서: [API_CONTRACT.md](API_CONTRACT.md)

PostgreSQL 18.6은 `127.0.0.1:5433`에서 동작합니다. 개발 DB는 `app`, 별도 테스트 DB는 `damso_test`입니다. 공식 EDB Windows 바이너리를 `tmp/postgresql/`에 준비하며 시스템 서비스·전역 DB를 설치하지 않습니다. 한글 경로 문제를 피하려고 임시 폴더에 프로젝트를 가리키는 junction을 만들지만, 실제 데이터는 `backend/data/postgres/`에 저장합니다.

`Ctrl+C`는 API와 함께 실행한 AI 워커를 종료합니다. DB는 유지됩니다. DB 종료 전 API를 종료하세요.

```powershell
.venv/Scripts/python.exe -X utf8 scripts/postgres-local.py status
.venv/Scripts/python.exe -X utf8 scripts/postgres-local.py stop
```

## 설정과 데이터

`backend/.env.local`은 DB·JWT·관리자 설정입니다. 상위 `damso-server/.env.local`의 기존 AI 키 파일과 별개이며 해당 파일을 읽거나 덮어쓰지 않습니다. 두 파일 모두 Git 추적 대상에서 제외합니다.

키 입력 화면은 HCX 키를 `backend/data/integrations/clova.json`, Speech Secret Key·Invoke URL을 `backend/data/integrations/clova-speech.json`에 각각 저장합니다. Invoke URL 경로에도 비밀 값이 있으므로 키와 같이 취급합니다. 이 파일은 로컬 평문 설정이며 Git·Docker 이미지에 포함하지 않습니다. 브라우저 저장소·앱·응답 본문에는 키를 돌려주지 않습니다. 기존 `.env.local`의 CLOVA 키를 자동으로 가져오지 않습니다.

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
| `CLOVA_CONFIG_FILE` | HCX 비공개 설정 파일 위치. API와 워커는 같은 파일을 사용해야 함 |
| `CLOVA_SPEECH_CONFIG_FILE` | Speech 비공개 설정 파일 위치. API와 워커가 공유 |
| `ENABLE_LLM_SETUP_UI` | 기본 false. `run-local.py`가 로컬 실행에만 true로 설정 |

로그인·코드 추측·업로드 등에 PostgreSQL 기반 요청 제한을 적용합니다. 일반 본문은 1 MiB, 업로드 본문은 파일 한도 + 1 MiB로 제한합니다. WAV, MP3, M4A/MP4, WebM/Matroska, Ogg, FLAC을 검사하며 비디오·재생 목록·외부 URL 참조를 허용하지 않습니다. 길이 정보가 없는 음성에도 파일 크기 제한은 항상 적용합니다.

- 초안, 수정 전 원문, 전사문, AI 요약 초안은 작성자만 조회합니다.
- `/submit`에서 확정한 글만 공개합니다. 원본 음성은 `share_audio: true`를 명시해야 공유합니다. 글에서 지운 부분이 음성으로 노출되는 것을 방지하기 위한 구분입니다.
- AI는 원문을 덮어쓰거나 자동 제출하지 않습니다. 작성자가 `/submit`을 요청하면 기본적으로 생성된 요약 초안을 공개합니다. `text`로 직접 확정한 글을 보내거나 `use_summary:false`로 원문을 선택할 수 있습니다. 이미 공개된 기록은 뒤늦은 AI 처리로 바뀌지 않습니다.
- 연결 해제 후 각자 본인 기록을 보관합니다. 이전 상대·새 상대에게 과거 연결 기록을 공개하지 않습니다.
- 제출한 본문은 조용히 덮어쓸 수 없습니다. 삭제 후 다시 작성합니다. 답변 삭제 후 연결되지 않은 음성도 별도로 삭제할 수 있습니다. 탈퇴하면 본인 음성 파일도 제거합니다.
- 날짜는 `Asia/Seoul`, DB 시각은 UTC입니다. 기본 질문은 부모 10개·자녀 10개를 순환합니다. 서비스 질문 수는 콘텐츠 기획에 맞춰 늘리세요.

## STT·LLM 연결

STT는 `app/speech.py`의 CLOVA Speech 장문 인식 어댑터를 사용합니다. 비공개 로컬 음성을 16 kHz·모노 PCM WAV로 변환하여 공식 `/recognizer/upload`에 동기 요청합니다. WebM/Opus도 변환하며 실제 디코딩 길이 600초·원본 25 MiB를 기본 한도로 검사합니다. 빈 전사는 `NO_SPEECH`로 실패 처리하고 LLM을 호출하지 않습니다. TTS는 별도입니다.

[공식 로컬 파일 API](https://api.ncloud-docs.com/docs/ai-application-service-clovaspeech-longsentence-local)와 [도메인 안내](https://guide.ncloud-docs.com/docs/clovaspeech-builder-long)를 기준으로 구현했습니다. `COMPLETED`만 최종 결과로 인정합니다. 합성 음성 1건으로 STT 인증과 HCX 연결을 확인했습니다. 전체 처리 3.6초는 단일 사례이며 실제 사용자·사투리 인식률과 평균 지연은 평가하지 않았습니다. [연결 검증 기록](STT_LLM_CONNECTION_TEST_REPORT.md)을 참고하세요.

LLM은 `app/llm.py`의 HCX-007 제공자를 사용합니다. `python -m app.worker`는 반복 실행, `--once`는 최대 한 작업만 처리합니다. 음성→STT→LLM은 두 번의 작업 처리이므로 단일 `--once`로 전체 흐름이 끝나지 않습니다. 키가 없으면 외부 호출 없이 기다립니다. API를 직접 `uvicorn`으로 실행했다면 워커도 별도 실행해야 합니다. 로컬 실행 스크립트와 Docker 구성은 워커를 함께 준비합니다.

공통 프롬프트는 `app/prompts/damso_v1.txt`, 버전은 `damso-v1.6`입니다. 작성자 관점의 1인칭 요약과 전사문 말투 유지(auto, 기본)와 선택적 고정 문체(diary), 원문 사실·부정·불확실성 보존, 무리한 감정 창작 금지, 단일 존댓말 꼬리질문, 대화 중단 존중을 지시합니다. 입력은 system 지시와 분리된 user JSON으로 전달합니다. [HCX-007 공식 Structured Outputs](https://api.ncloud-docs.com/docs/en/clovastudio-chatcompletionsv3-so)의 JSON 출력·`thinking.effort:none`을 사용합니다.

음성 → STT 작업 → 전사 성공 → LLM 작업 순서입니다. 글이 명시되면 그 글을 입력으로 사용합니다. LLM은 `summary`, `follow_up_question`만 반환하고, 질문이 없으면 빈 문자열을 서버에서 null로 바꿉니다. 필드·타입·길이를 검사하며 잘못된 결과는 원문을 보존한 채 실패로 기록합니다. 실패 작업은 최대 3회 시도합니다. 원문 수정 시 revision을 올리고 이전 작업 결과를 폐기합니다. HTTP 호출 중 DB 잠금을 유지하지 않고, 중단된 running 작업은 3분 뒤 다시 확보할 수 있습니다.

호출 주소는 고정되어 있으며 리다이렉트·환경 프록시를 사용하지 않습니다. 시간·응답 크기 제한과 정해진 오류 코드만 사용하며 키·원문을 포함할 수 있는 외부 오류 메시지는 반환하지 않습니다. 이 제한과 프롬프트만으로 모든 인젝션·내용 누락이 해결되는 것은 아닙니다. [최근 전사문 실호출 결과](STT_LLM_TEST_REPORT.md)와 [이전 실호출 결과](LLM_TEST_REPORT.md)를 참고하세요.

## 키 등록과 순차 테스트

`/dev/llm`은 개발 PC의 loopback 접속만 허용하며, 다른 origin·위조 Host·CSRF 헤더 없는 쓰기를 거절합니다. 기본 설정에서는 비활성화되므로 공개 운영 관리화면으로 쓰지 않습니다. 브라우저에 URL을 직접 입력해 열어주세요.

CLOVA Speech는 콘솔의 장문 인식 도메인 → 빌더 → 설정 → 연동 정보에서 Secret Key와 Invoke URL을 발급받습니다. URL은 `https://clovaspeech-gw.ncloud.com/external/v1/{도메인ID}/{InvokeKey}` 형태이며 `/recognizer/upload`를 붙이지 않습니다. **STT 설정 저장은 로컬 저장만 하며 인증 성공을 뜻하지 않습니다.** 두 키가 준비되면 같은 화면의 음성 파일 테스트로 전사·요약·꼬리질문을 확인할 수 있습니다. 음성은 CLOVA Speech, 전사문은 HCX로 전송되며 각각 사용량이 발생합니다. 테스트 파일은 처리 후 삭제하고 서재에는 저장하지 않습니다.

HCX 키 등록 후에는 예시 7건을 순서대로 호출합니다. '형식 확인'은 내용의 정확성을 보증하지 않습니다. 직접 입력한 테스트도 서재에 자동 저장하지 않습니다. CLI 검증은 아래처럼 수행합니다.

```powershell
.venv/Scripts/python.exe -X utf8 scripts/test-hcx-live.py
.venv/Scripts/python.exe -X utf8 scripts/test-hcx-storage.py
.venv/Scripts/python.exe -X utf8 scripts/test-transcripts-live.py
```

첫 명령은 합성 예시 7건을 실호출합니다. 두 번째는 **damso_test만 초기화**하고 합성 계정으로 실제 워커 → 요약 초안 → 제출 → 자녀 서재 공개를 한 번 실호출합니다. 세 번째 명령은 합성 전사문 8개 중 무작위 3개를 HCX에 보내며 STT는 호출하지 않습니다. 세 명령 모두 실제 API 사용량이 발생하며 `data/llm-tests/`에 키 없는 보고서를 저장합니다. 일반 회귀 테스트는 모의 응답만 사용합니다.

## Docker와 외부 배포

```powershell
cd damso-server
docker compose --env-file backend/.env.local -f compose.backend.yml up --build -d
```

DB 준비 → 마이그레이션·시드 → API·워커 순서로 실행하며 DB·음성·HCX 설정을 각각 영속 볼륨에 저장합니다. 설정 UI는 Docker 기본 구성에서 꺼져 있습니다. 로컬에서 등록한 키 파일이 Docker 볼륨으로 자동 복사되지는 않습니다. **현재 PC에는 Docker가 없어 이미지 빌드·Compose 실행은 검증하지 않았습니다.** 네이티브 DB와 같은 5433 포트를 사용하므로 동시에 실행하지 마세요. 데이터 저장소도 서로 별개입니다.

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

## 가족 호칭 표시

자녀는 `PATCH /api/v1/families/me/settings`에 `{"parent_label":"어머니"}`를 보내 현재 연결에서 사용할 부모님 호칭을 저장합니다. 기본값은 성별을 가정하지 않는 `부모님`이며, `엄마`, `아빠`, `어머니`, `아버지` 중 선택할 수 있습니다. 설정은 자녀 본인에게만 적용되고 연결 해제 후 새 가족에 계승되지 않습니다. 서재 응답의 `author_story_label`을 표시하면 `어머니의 이야기`, `나의 이야기`, `민수의 이야기`처럼 읽는 사람에 맞게 나타납니다. 본문 문자열을 치환하지 않으며 기존 저장 본문을 다시 생성하지 않습니다.

프론트 미리보기에서는 같은 동작을 기기 내 AsyncStorage로 검증합니다. 계정 로그인·백엔드 API 연결은 별도 작업이며 두 저장소가 자동 동기화되지는 않습니다. v1.4의 최근 HCX 실호출 3건과 내용 검토는 [STT_LLM_TEST_REPORT.md](STT_LLM_TEST_REPORT.md)에 기록했습니다.

## 첫 설정과 자동 말투 정리 (2026-10-20)

모바일 `/onboarding`에서 호칭을 설정하고 말투 유지 안내를 확인합니다. 문체 선택 단계는 제거했습니다. 기본 `auto`는 원문의 존댓말·반말·회상형 표현을 살린 1인칭이며 말투가 모호하면 해요체를 씁니다. 반복을 줄여도 원문에 없는 감정·반응·사실은 추가하지 않습니다. LLM 입력은 음성이 아닌 전사문입니다.

설정에서만 고정 문체(diary)를 선택할 수 있습니다. 서버는 프로필의 `summary_style`을 저장하고 워커가 작업 시작 시 작성자 설정을 읽어 서버가 관리하는 지시를 사용합니다. 신규 계정 기본값은 auto입니다. `c5e202100001` 마이그레이션은 이전 필수 선택을 auto로 전환하며 기존 초안·공개 본문은 수정하지 않습니다. 모바일도 이전 설정의 호칭·역할·완료 여부를 보존하며 auto로 전환합니다.

프론트는 기기 내 저장이고 서버는 계정별 저장이며 아직 API로 동기화하지 않습니다. 모의 API·회귀 검사로 배선을 검증했으며 v1.6의 Speech→HCX 실호출 1건은 연결 검증 기록에 남겼으며 실제 사용자 음성이나 TTS 청취 평가는 하지 않았습니다. 과거 실호출 보고서는 당시 프롬프트의 결과입니다.

현재 문체는 `auto`, `diary`만 지원합니다. `c6e202100001`은 삭제된 conversational/formal 설정을 auto로 전환합니다. 기존 이야기와 diary 선택은 유지합니다.


## 재답변·추가 질문 확인

마이그레이션 c7e202100001 이후 워커를 실행합니다. 모바일 설정의 로그인에서 가족 연결을 마친 계정으로 접속하면 실제 질문·서재·요약을 사용합니다. 로그인 토큰은 메모리에만 유지하므로 새로고침 후 다시 로그인합니다. 계정 생성·가족 연결은 기존 API를 이용하며 이 로그인 화면이 전체 가입 UI를 대신하지는 않습니다.

웹은 http://localhost:8081, API 기본값은 http://127.0.0.1:8000 입니다. 실기기에서는 EXPO_PUBLIC_API_URL에 기기에서 접근 가능한 서버 주소를 지정하고 배포 시 HTTPS를 사용합니다. API 키는 모바일이 아닌 서버의 로컬 개발 설정 화면에만 등록합니다. 녹음 권한은 사용자가 녹음 시작을 눌렀을 때 요청합니다.

2026-10-20 검증: 서버 74개, 모바일 기존 테스트 6개, 타입·린트·웹 export 통과. alembic check에서 추가 변경 없음. HCX 실제 3개 상태 호출과 브라우저의 no_story→재답변→요약 확인→공개→상대방의 다음 날 예약 흐름을 확인했습니다. 실제 날짜를 기다린 검증 대신 날짜를 고정한 서버 테스트로 다음 날 노출을 확인했습니다. Android/iOS 실기기 녹음·빌드와 OS 푸시 알림은 검증/구현 범위에 포함되지 않습니다.


## 2026-10-21 사진·앨범·질문 3개 한도

`c8e202100001`로 업그레이드한 뒤 API와 워커를 다시 시작합니다. StoryPhoto 테이블과 종류별 추가 질문 유일 제약이 추가됩니다. 현재 로컬 앱 DB와 테스트 DB에 적용했습니다. 사진도 STORAGE_ROOT의 비공개 파일이므로 DB와 파일을 함께 백업합니다. 공개 정적 디렉터리에 연결하지 않습니다.

최신 질문 정책과 사진 API는 API_CONTRACT.md의 2026-10-21 절을 따릅니다. 서버 82개 검사를 통과했고, 동시 질문 발송 제한·기본/AI/가족 예약 3개 공존·사진 권한·메타데이터 제거·가족 해제·삭제 정리를 확인했습니다. 테스트는 모의 AI 제공자를 사용하여 외부 API 비용이 발생하지 않습니다.

브라우저에서 이야기 사진 등록·확대·가족 앨범 표시와 세 가지 손글씨 전환을 확인했습니다. Android/iOS 사진 선택과 HEIC 변환은 실기기 확인이 남아 있습니다. HEIC 파일을 서버에 직접 보내는 것은 지원하지 않습니다.


### 원문·원음 조회 추가 검증

`c9e202100001` 마이그레이션으로 원문 텍스트 공유 선택을 추가했습니다. 기존 데이터는 false를 유지합니다. API와 워커 재시작 후 85개 서버 테스트 및 Alembic 모델 일치를 확인했습니다. 작성자만 공유 변경, 명시적 가족 공유·해제, 원음 Range 재생, 가족 종료 시 접근 차단을 검사합니다.

웹에서는 인증 후 임시 Blob URL로 원음을 재생하고 화면을 닫으면 플레이어와 URL을 해제합니다. 네이티브는 Bearer 헤더를 붙여 원래 미디어 경로를 사용합니다. 실제 Android/iOS 청취는 별도 확인이 필요합니다. 브라우저 재생 검증에는 합성한 테스트음을 사용했으며 실제 발화/STT 정확도 평가는 하지 않았습니다.
