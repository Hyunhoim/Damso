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

`GET /answers/{id}/processing`은 `providers`와 `jobs`를 반환합니다. 현재 제공자는 `not_configured`, 새 작업은 `waiting_provider`입니다. 실제 모델이 없으므로 무한 폴링하지 않습니다.

`POST /answers/{id}/processing`은 현재 revision의 작업을 중복 없이 확보합니다. `POST /answers/{id}/processing/{job_id}/retry`는 실패 작업을 다시 대기시킵니다. `succeeded`, `failed`, `superseded`도 화면에서 처리할 수 있도록 구성하세요.

요약·꼬리 질문은 작성자 답변의 `summary_draft`, `follow_up_question`으로 표시할 예정이며 미연결 시 `null`입니다. 전사·요약을 임의로 만들어 채우지 않습니다. 요약은 확인 후 제출할 최종 글로 선택해야 공개됩니다.

## 로그인 유지·오류

- `POST /login/refresh`: `{"refresh_token":"..."}` → 새 access·refresh. 이전 두 토큰은 폐기. 동시에 여러 갱신 요청을 보내지 말고 하나로 합칩니다.
- `POST /login/logout`, `POST /login/logout-all`: 현재/전체 로그인 무효화.
- `PATCH /users/me/password`: `current_password`, `new_password`. 변경 후 재로그인.
- 모바일 refresh token은 OS 보안 저장소에 보관하고 URL·로그에 넣지 않습니다.
- 401/403 인증·권한, 404 조회 가능한 자료 없음, 409 연결·중복·상태 충돌, 413 크기 초과, 422 입력 오류, 429 제한(`Retry-After`), 503 DB 또는 이메일 미준비.
- 비밀번호 복구는 SMTP 설정과 모바일 복구 링크 화면이 별도로 필요합니다.
