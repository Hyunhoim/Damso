# 담소 API 키 등록

서버 전용 AI 키 보관 파일과 로컬 점검 명령입니다. 별도 패키지 설치 없이 Node.js 24 이상에서 키 입력 상태를 점검할 수 있습니다.

공식 FastAPI 템플릿의 백엔드를 `backend/`에 별도로 가져왔습니다. [백엔드 실행 안내](./backend/README.md)를 참고하세요. 기존 AI 키 파일은 유지했으며, 가족 연결·질문·답변·서재·음성 업로드 API와 PostgreSQL을 구현했습니다. 모바일 화면 연결과 실제 STT·LLM 모델 호출은 아직 하지 않았습니다.

## 1. 키 발급

- **OpenAI**: [API Keys](https://platform.openai.com/api-keys)에서 담소에 사용할 프로젝트의 API 키를 생성합니다. [공식 시작 안내](https://developers.openai.com/api/docs/quickstart)를 참고하세요. Whisper 모델은 요청한 `whisper-1`을 사용합니다.
- **HyperCLOVA X**: 네이버 클라우드 콘솔 → AI Services → CLOVA Studio → API 키 → 테스트 → 테스트 API 키 발급. 현재 개발 단계에서는 테스트 키를 사용합니다. [공식 발급 안내](https://guide.ncloud-docs.com/docs/clovastudio-apikey). NCP 계정의 Access Key/Secret Key 또는 구 버전 API Gateway 키를 넣는 방식이 아닙니다.

계정별 이용 권한·API 과금 설정은 각 콘솔에서 확인해야 합니다. 발급된 키는 채팅이나 스크린샷으로 공유하지 마세요.

## 2. 로컬 등록

이 폴더의 `.env.local`에서 `OPENAI_API_KEY=`와 `CLOVASTUDIO_API_KEY=` 뒤에 각각 키 **값만** 붙여넣고 저장하세요. `Bearer ` 접두어는 붙이지 않습니다. 모델 이름 두 줄은 그대로 둡니다.

`.env.local`은 로컬 평문 파일이며 `.gitignore`로 Git 추적에서 제외됩니다. 이 파일을 공유하거나 Expo 프로젝트로 복사하지 마세요. 앱의 `EXPO_PUBLIC_*` 변수에는 비밀 키를 넣지 않습니다. 팀원은 `.env.example`을 복사한 뒤 각자의 키를 등록합니다.

점검은 저장소 루트에서 실행합니다.

```powershell
npm.cmd --prefix damso-server run check:env
```

키 값은 출력하지 않고 각 항목의 입력 여부만 출력합니다. 다른 프로젝트에서 설정한 시스템 환경변수는 사용하지 않습니다. 비어 있거나 공백이 포함된 키 또는 모델 이름 불일치는 종료 코드 1로 표시합니다. 입력 여부는 실제 키의 유효성이나 호출 권한을 뜻하지 않습니다.

## 3. 이후 연결할 API

- Whisper: `POST https://api.openai.com/v1/audio/transcriptions`, 모델 `whisper-1`. [공식 전사 API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create).
- HCX-007: `POST https://clovastudio.stream.ntruss.com/v3/chat-completions/HCX-007`. [공식 v3 API](https://api.ncloud-docs.com/docs/clovastudio-chatcompletionsv3-thinking).
- 두 서비스 모두 서버 요청의 `Authorization: Bearer ...`에 해당 제공자의 키를 사용합니다. 앱에는 서버 주소만 전달하는 구조로 다음 단계에서 연결합니다.

현재 점검 명령은 네트워크 호출을 하지 않습니다. 실제 인증 확인은 별도 호출이 필요하며 사용량이 발생할 수 있습니다.

## 검증

```powershell
npm.cmd --prefix damso-server test
```
