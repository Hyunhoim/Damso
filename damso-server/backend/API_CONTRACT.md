# 모바일 연결용 API

기본 주소: `http://127.0.0.1:8000/api/v1`. 휴대폰에서는 PC의 LAN 주소와 해당 주소로 실행한 API가 필요합니다. AI 키·DB 비밀번호는 Expo 공개 변수에 넣지 않습니다.

## 가입 → 연결 → 질문

1. `POST /users/signup`: `{"email":"parent@example.com","password":"8자 이상 비밀번호","full_name":"지영","role":"parent"}`. 자녀는 `child`.
2. `POST /login/access-token`: **JSON이 아닌 form**으로 `username`(이메일), `password` 전송.
3. `Authorization: Bearer <access_token>` 헤더 사용. Access 15분, refresh 30일.
4. 한 사람이 `POST /families/invitations` → `code`, `expires_at`, `family_id` 반환.
5. 다른 사람이 `POST /families/invitations/preview`에 `{"code":"ABC234"}` → 상대 이름·역할 확인.
6. 확인 후 `POST /families/join`에 같은 코드 전송. 부모 1명·자녀 1명만 연결 가능.
7. `GET /families/me` → `unlinked`, `waiting`, `connected`. 둘 다 코드를 발급했다면 한 사람은 `DELETE /families/me`로 대기 연결을 해제하고 상대 코드를 입력.
8. `GET /questions/today` → `date`, `role`, `daily`, `custom`. 역할별 다른 질문, 같은 날 같은 ID.

## 답변과 공개

`POST /answers`에 `{"question_id":"질문 UUID","text":"첫 월급으로 내복을 사드렸어요."}`를 보내면 201과 초안 ID를 반환합니다. 음성은 `POST /audio`에 multipart `file`로 업로드하고 `text` 대신 `audio_id`를 보냅니다.

- `GET /answers/drafts`: 작성 중 초안 복구.
- `PATCH /answers/{id}`: `{"text":"수정한 원문"}`. 수정 전 원문 보존, revision 증가.
- `POST /answers/{id}/submit`: `{"title":"첫 월급","text":"공개할 최종 글","share_audio":false}`.
- `text`를 생략하면 생성된 요약 초안을 기본으로 공개합니다. `use_summary:false`를 보내면 수정한 원문·입력 원문·전사문 순서로 사용합니다. 작성자 확인 없이 AI가 자동 제출하지는 않습니다.
- 제출 즉시 상대에게 공개. 상대의 답변 여부를 기다리지 않음.
- 음성만 공개할 때는 `{"share_audio":true}`. 원음 공유를 선택하지 않으면 상대에게 `audio_url`을 반환하지 않음.
- 같은 제출 요청 반복 시 기존 제출 결과 반환. 질문 하나당 답변 하나.
- `DELETE /answers/{id}`: 본인 답변 삭제.

## 서재·질문·설정

| 요청 | 설명 |
| --- | --- |
| `GET /library?role=parent&start=2026-10-01&end=2026-10-31&skip=0&limit=20` | 날짜·역할별 조회. `{data,has_more,next_skip}` |
| `GET /library/{id}` | 이야기·댓글·공감 목록 |
| `POST /library/{id}/comments` | `{"text":"그때 어떤 기분이셨어요?"}` |
| `DELETE /library/{id}/comments/{comment_id}` | 본인 댓글 삭제 |
| `PUT /library/{id}/reaction` | 공감. 중복 생성 안 됨 |
| `DELETE /library/{id}/reaction` | 공감 취소 |
| `GET /audio/{id}/content` | 인증 후 음성 재생. Range 지원 |
| `DELETE /audio/{id}` | 연결된 답변을 먼저 삭제한 뒤 본인 음성 삭제 |
| `POST /questions/custom` | 부모 전용. `{"text":"요즘 가장 기쁜 일은?","available_date":"2026-10-20"}`. 날짜 생략 시 오늘, 최대 30일 후 |
| `GET /questions/custom` | 현재 가족의 개별 질문 |
| `DELETE /questions/custom/{id}` | 만든 사람이 미답변 질문 취소 |
| `GET /profile`, `PATCH /profile` | `full_name`, `text_scale`, `reminder_time`, `notifications_enabled`. 연결 중 역할 변경 불가 |
| `GET /notifications` | 앱 내부 알림 |
| `PATCH /notifications/{id}/read` | 내 알림 읽음 |
| `DELETE /families/me` | 연결 해제. 각자 본인 기록 보관 |
| `DELETE /users/me` | 탈퇴·본인 데이터와 음성 삭제 |

음성 URL에도 Authorization 헤더가 필요합니다. 웹 `<audio src>`는 임의 헤더를 넣을 수 없으므로 인증된 fetch로 Blob을 받아 재생하는 방식 등이 필요합니다. Expo에서는 헤더를 지원하는 재생 소스를 사용합니다.

## AI 상태

`GET /answers/{id}/processing`은 `providers`와 `jobs`를 반환합니다. STT(CLOVA Speech)와 LLM(HCX-007)은 각각 키가 있으면 `configured`, 없으면 `not_configured`입니다. 설정 여부는 실제 인증 성공을 뜻하지 않습니다. 키가 없는 작업은 `waiting_provider`, 준비된 작업은 `queued`로 저장합니다. `waiting_provider`를 무한 폴링하지 않습니다.

`POST /answers/{id}/processing`은 현재 revision의 작업을 중복 없이 확보합니다. `POST /answers/{id}/processing/{job_id}/retry`는 실패 작업을 다시 대기시킵니다. `running`, `succeeded`, `failed`, `superseded`도 화면에서 처리하세요. `AUTH_FAILED`, `ACCESS_DENIED`, `RATE_LIMITED`, `PROVIDER_TIMEOUT`, `INVALID_PROVIDER_OUTPUT` 등 제한된 오류 코드만 반환합니다.

음성 답변은 STT 완료 후 작성자 전용 `transcript`에 저장하고 LLM 작업을 생성합니다. 빈 전사는 `NO_SPEECH`, 길이 초과는 `AUDIO_TOO_LONG`, 잘못된 음성은 `INVALID_AUDIO`로 실패하며 원본은 보존합니다. 음성 변환·외부 호출 실패 시 오류 코드를 표시하고 재시도 API를 사용하세요.

HCX-007이 생성한 요약·단일 꼬리질문은 작성자 답변의 `summary_draft`, `follow_up_question`에 저장합니다. 질문이 적절하지 않으면 null입니다. 원문은 보존하며, 작성자가 확인·제출한 요약만 서재에 공개합니다. 이후 AI 처리가 완료되어도 이미 제출한 본문을 덮어쓰지 않습니다.

키 등록·개발용 실호출 화면은 `http://127.0.0.1:8000/dev/llm`입니다. 모바일 설정 페이지에 키를 넣지 않습니다. 이 화면은 로컬 실행에서만 활성화되며 Swagger·앱 API와 분리되어 있습니다.

## 로그인 유지·오류

- `POST /login/refresh`: `{"refresh_token":"..."}` → 새 access·refresh. 이전 두 토큰은 폐기. 동시에 여러 갱신 요청을 보내지 말고 하나로 합칩니다.
- `POST /login/logout`, `POST /login/logout-all`: 현재/전체 로그인 무효화.
- `PATCH /users/me/password`: `current_password`, `new_password`. 변경 후 재로그인.
- 모바일 refresh token은 OS 보안 저장소에 보관하고 URL·로그에 넣지 않습니다.
- 401/403 인증·권한, 404 조회 가능한 자료 없음, 409 연결·중복·상태 충돌, 413 크기 초과, 422 입력 오류, 429 제한(`Retry-After`), 503 DB 또는 이메일 미준비.
- 비밀번호 복구는 SMTP 설정과 모바일 복구 링크 화면이 별도로 필요합니다.

## 가족 표시 호칭

- `PATCH /families/me/settings`: 자녀 본인만 `{"parent_label":"어머니"}`로 설정. 허용값 `부모님`, `엄마`, `아빠`, `어머니`, `아버지`. 연결 전 409, 부모 호출 403.
- `GET /families/me`의 `settings.parent_label`은 현재 사용자의 연결별 설정이며 기본 `부모님`. 새 가족 연결 시 기본값으로 초기화.
- 이야기 응답의 `author_name`은 원래 계정 이름을 유지. `author_display_name`과 `author_story_label`은 조회자 기준 표시값. 본인 기록은 `나`·`나의 이야기`, 자녀가 보는 부모 기록은 `어머니`·`어머니의 이야기`, 부모가 보는 자녀 기록은 `민수`·`민수의 이야기` 형태.
- 표시 호칭을 바꿔도 원문·공개 본문·전사문·AI 초안은 바뀌지 않음. 본문 전체 이름/관계 문자열을 치환하지 않음. 신규 요약은 v1.8 공통 프롬프트로 작성자 관점의 1인칭으로 정리하며 가족 관계를 유지.

## 요약 문체

`GET /profile`은 `summary_style`을 반환하고 `PATCH /profile`로 저장합니다. 기본 `auto`는 전사문의 말투를 살린 1인칭 요약입니다. 설정에서만 선택할 수 있는 고정 문체는 `diary`(했다)입니다. 잘못된 값은 422입니다. 온보딩에서는 문체를 필수로 선택하지 않습니다.

처리 시작 시 작성자의 설정을 사용합니다. auto는 존댓말·반말·회상형 종결어미를 보존하고 반복을 줄이며, 혼용·짧은 입력처럼 판단이 어려우면 해요체를 사용합니다. 이는 전사문 분석이며 음성 억양·감정 분석이 아닙니다. 꼬리질문은 존댓말입니다. 기존 기록은 재생성하지 않습니다. 자녀 호칭은 가족 설정 API를 사용하며 요약 본문과 분리합니다.

마이그레이션 `c5e202100001`은 기존 필수 선택을 auto로 전환하며 이후 사용자가 명시적으로 선택한 고정 문체는 유지합니다. 모바일 로그인 후 문체 변경은 서버 프로필에 저장합니다. 로그인 전 미리보기 설정은 기기 내 설정입니다.

현재 문체는 `auto`, `diary`만 지원합니다. `c6e202100001`은 삭제된 conversational/formal 설정을 auto로 전환합니다. 기존 이야기와 diary 선택은 유지합니다.


## 정리 결과와 재답변 (2026-10-20)

LLM v1.8은 `status`, `title`, `summary`, `follow_up_question`을 필수로 반환합니다. 상태는 `ready`(정리 가능), `no_story`(관련 경험 없음), `declined`(답변 중단)입니다. 비정상 JSON/상태 누락/모순은 실패로 처리합니다. no_story와 declined는 빈 title·summary와 빈 follow_up_question을 반환하며 저장 시 질문은 null로 바꿉니다. 안내 문장을 서재 본문으로 저장하지 않습니다.

작성자 답변 API의 `organization_status`로 화면을 분기합니다. no_story에는 다시 녹음하기·글로 답하기·오늘은 건너뛰기를 제공합니다. declined는 중단을 존중하는 안내를 표시합니다. ready 초안은 작성자가 확인·수정한 후 제출합니다. 이미 no_story/declined로 판단된 답변은 제출할 수 없습니다. 기존 수동 제출 API의 미판정 답변 허용 정책은 유지합니다.

- `POST /answers/{id}/replace-input`: text 또는 audio_id 중 하나. 작성자 미제출 답변만 교체하고 새 revision으로 처리합니다. 이전 입력은 비공개 이력에 보존하며 음성은 삭제하지 않습니다. 이전 revision의 작업은 superseded 처리합니다.
- `POST /answers/{id}/skip`: 작성자 초안을 건너뛰기 처리합니다. 공개하거나 원본을 삭제하지 않습니다.
- 이전 입력 이력이 참조하는 음성도 직접 삭제를 차단합니다. 상대 가족은 이 이력을 읽을 수 없습니다.

## 추가 질문과 가족 요청

`GET /questions/today`는 기본 daily를 유지하면서 `follow_up`을 추가로 반환합니다. follow_up은 kind(ai/family), source_answer_id, source_title, source_text, answer_id, answer_status를 포함합니다. 미래 예약은 그날까지 노출하지 않습니다.

한국 시간 기준 사용자별 하루 최대 1개의 추가 질문만 발급합니다. DB의 (user_id, day) 유일 제약으로 동시 처리와 재처리에도 제한을 지킵니다. AI는 관련 질문이 있을 때만 발급하며 추가 질문의 답변에서는 다시 꼬리질문을 만들지 않습니다.

`POST /library/{answer_id}/follow-up`은 연결된 상대의 공개 기록에만 가능합니다. 부모와 자녀 모두 사용할 수 있으며 다음 날 작성자에게 추가 질문을 예약합니다. 응답은 scheduled_for, question_id, source_answer_id, status입니다. 같은 요청은 기존 예약을 돌려주고 다른 이야기가 이미 예약되어 있으면 409를 반환합니다. 다음 날 가족 예약이 AI 질문보다 우선하며 그날 추가 질문 1개를 차지합니다. 기본 질문은 유지합니다. 이는 앱에서 조회하는 예약 기능이며 OS 푸시 알림은 구현하지 않았습니다.

원본 이야기 삭제 시 관련 추가 질문을 취소하되 사용한 당일 발급 슬롯은 복구하지 않습니다. 연결이 해제된 가족의 예약을 새 가족에게 노출하지 않습니다. 마이그레이션은 c7e202100001입니다.


## 이야기 대제목

LLM v1.8은 본문과 별도로 `title` 하나를 생성합니다. 8~20자를 권장하고 서버는 최대 40자 및 단일 줄을 검사합니다. ready에는 비어 있지 않은 title과 summary가 필수이며 no_story/declined에는 둘 다 비어 있어야 합니다. 제목에 본문의 첫 부분을 자르거나 제목을 본문 앞에 반복하지 않도록 지시합니다.

생성된 제목은 기존 Answer.title에 비공개 초안으로 보관하며, 작성자 화면의 요약 헤더에 표시합니다. 제출 시 명시한 제목 또는 생성된 제목을 사용합니다. 미생성 수동 답변은 일반 제목을 사용하며 본문 앞 40자를 자르지 않습니다. 재답변·원문 수정 시 이전 초안 제목은 초기화합니다. 이미 공개한 제목은 늦게 도착한 AI 결과로 덮어쓰지 않습니다. 기존 공개 기록은 자동 재작성하지 않습니다.


## 2026-10-21 변경: 하루 질문과 이야기 사진

이 절의 질문 한도는 이전의 추가 질문 1개 설명보다 우선합니다. 사용자별 한국 날짜 기준 기본·개별·AI·가족 예약 질문을 모두 합해 최대 3개입니다. 기본 템플릿 질문 1개를 위한 자리는 항상 남깁니다. AI 질문은 하루 최대 1개, 가족 예약은 다음 날 최대 1개이며 각각 공존할 수 있습니다. 취소된 질문도 당일 발송 수에 포함합니다. 최대 수이므로 매일 3개를 자동 생성하는 정책은 아닙니다.

`GET /questions/today`는 기존 필드에 `daily_limit:3`, `follow_ups:[]`를 추가합니다. 호환용 `follow_up`은 그 목록의 첫 항목입니다. 가족 예약을 먼저 표시하며 개별 질문은 해당 날짜에만 답할 수 있습니다. 한도 초과 생성·예약은 409입니다.

| 요청 | 설명 |
| --- | --- |
| `POST /library/{answer_id}/photos` | 작성자의 현재 가족에 공개한 이야기만 사진 등록. multipart `file`, 성공 201 |
| `GET /library/{answer_id}/photos` | 이야기를 볼 수 있는 사용자에게 `{data}` 반환 |
| `GET /photos/album?skip=0&limit=24` | 조회 가능한 이야기의 사진 모음. `{data,has_more,next_skip}`, 최대 50개씩 |
| `GET /photos/{id}/content` | Bearer 인증 후 JPEG 반환. 공개 URL이나 토큰 쿼리 사용 안 함 |
| `DELETE /photos/{id}` | 작성자만 삭제. 이야기·계정 삭제 시에도 사진 파일 정리 |

사진 응답: `id`, `answer_id`, `width`, `height`, `created_at`, `content_url`. 파일별 10MiB·2천만 화소, 이야기별 12장까지입니다. JPEG·PNG·WebP를 검사하고 최대 변 4096px JPEG로 변환하며 EXIF 등 원본 메타데이터를 제거합니다. 잘못된 이미지는 422, 용량 초과는 413입니다. 가족 연결 해제 후 상대 사진 접근은 차단하고 본인 기록은 유지합니다.


## 2026-10-21 원문 텍스트와 원음 보기

`GET /library/{id}`는 `original` 객체를 추가로 반환합니다. `text`는 요약·수정 이전의 현재 입력 원문(직접 입력 또는 STT 전사문)이며 `kind`는 `text` 또는 `transcript`입니다. `audio_url`, `has_audio`, `share_original`, `share_audio`도 포함합니다. 과거 재답변 이력이나 비공개 수정 이력을 가족에게 제공하지 않습니다.

작성자는 자기 원문·원음에 접근할 수 있습니다. 가족은 명시적으로 허용한 항목만 조회합니다. 원문 텍스트는 신규 `share_original` 선택에 따르며 기본 false입니다. 원음은 기존 `share_audio` 선택을 그대로 따릅니다. 기존 자료의 공유 범위는 자동 확대하지 않습니다.

`PATCH /answers/{id}/sharing`에 `{"share_original":true}` 또는 `{"share_audio":true}`를 보냅니다. 두 항목을 함께 설정할 수도 있습니다. 공개된 본인 이야기만 변경할 수 있고, 가족 연결 종료 후 다시 공유를 켤 수 없습니다. 원음이 없는 이야기에서 원음 공유를 켜면 422입니다. 제출 요청에도 `share_original`을 선택적으로 지정할 수 있습니다. 원음은 기존 인증·Range 응답 경로를 재사용하며 토큰을 URL 쿼리에 넣지 않습니다.
