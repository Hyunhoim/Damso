# 담소 React Native 프론트엔드

Expo SDK 56 / React Native 0.85.3 / Expo Router / TypeScript. 웹은 React Native Web으로 같은 화면을 렌더링합니다.

## 실행

저장소 루트에서 `powershell -ExecutionPolicy Bypass -File scripts/start-damso-preview.ps1`을 실행하고 http://localhost:8081 을 엽니다. 기존 서재 서버(5174)와 Expo 웹 서버(8081)를 함께 실행합니다. 이 스크립트는 이미 실행 중인 포트의 프로세스를 종료하지 않습니다.

수동 실행:

1. `damso-library`에서 `npm run web:dev`
2. `damso-mobile`에서 `npm run web`

처음 설치할 때는 각 폴더에서 `npm ci`를 실행합니다. 모바일 개발은 `damso-mobile`에서 `npm start` 또는 `npm run android`로 시작합니다. 기기에 맞는 Expo Go 또는 개발 빌드가 필요합니다.

## 이번 범위

- 큰 질문과 마이크 중심의 부모·자녀 홈.
- 날짜별 2D 서재, 역할 필터, 이야기 상세.
- ‘3D 화면으로 보기’ → 실제 모델 로딩 → 기존 Room.glb/Three.js 서재. 재시도·2D 복귀 포함.
- 톱니바퀴 설정 탭: 글자 크기·부모/자녀 역할 전환.
- 텍스트 답변은 원문 그대로 현재 메모리에 추가합니다. 앱 새로고침 시 초기화됩니다. 예시 기록은 ‘예시’로 구분합니다.

계정·가족 연결·백엔드·실제 녹음·STT·LLM·TTS·영구 저장은 이번 프론트 구현에 연결하지 않았습니다. 3D 책/액자에는 기존 프로토타입의 예시 데이터가 남아 있으며, 2D에서 작성한 기록과 동기화하지 않습니다.

## 3D 연결

기존 `../damso-library`의 모델과 장면을 그대로 사용합니다. 웹에서는 iframe, Android/iOS에서는 React Native WebView로 장면을 표시합니다. 3D 자체는 Three.js 웹 렌더러이며 네이티브 GL로 다시 구현한 것이 아닙니다. 모델을 두 번 복사하거나 새 방으로 대체하지 않았습니다.

로딩 완료는 모델 준비 후 두 프레임이 지난 시점의 `damso-room-ready` 메시지로 판단합니다. 웹은 메시지 출처의 origin과 iframe window를 함께 검증합니다. 60초 동안 준비 신호가 없거나 모델 렌더링에 실패하면 재시도 화면을 제공합니다.

실물 기기에서 127.0.0.1은 개발 PC가 아닙니다. `.env.example`을 참고해 `EXPO_PUBLIC_LIBRARY_3D_URL`에 기기에서 접근 가능한 HTTPS 서재 주소를 설정하세요. Android 에뮬레이터 기본값은 10.0.2.2:5174입니다. 네이티브 기기 빌드·터치 성능은 별도 검증 대상입니다.

## 검증

`npm test`, `npm run typecheck`, `npm run lint`, `npm run export:web`.

2026-10-18 기준 위 명령과 `npx expo install --check`를 통과했습니다. 브라우저의 375×844 화면에서 글자 크기·역할 전환, 텍스트 작성, 역할 필터, 이야기 상세, 실제 3D 모델 로딩 및 2D 복귀를 확인했습니다. Android/iOS 빌드는 실행하지 않았습니다.

현재 열린 8081 테스트 사이트는 `npm run export:web` 결과를 기존 Vite의 `preview --outDir dist --host 127.0.0.1 --port 8081 --strictPort`로 제공하며, 5174에서는 기존 3D 앱이 실행됩니다. 개발용 실행 스크립트를 다시 사용하면 Expo 개발 서버로 실행됩니다.

의존성 점검에서 Expo SDK 56의 전이 의존성 보안 경고 29건(높음 19, 보통 10)이 남아 있습니다. 일반 `npm audit fix`를 적용했으며 SDK를 강제 다운그레이드하는 수정은 적용하지 않았습니다. 현재는 로컬 프론트 검토용이고, 외부 배포 전 SDK 보안 패치 및 영향 범위를 다시 확인해야 합니다.

기존 꽃길·페이퍼로지 폰트의 WOFF 압축 컨테이너를 TTF로 변환하여 같은 글리프를 앱에 포함했습니다. 기존 서체 출처와 라이선스는 `../damso-library/public/fonts/README.md` 및 `assets/fonts/Paperlogy-LICENSE.txt`를 참고하세요.
