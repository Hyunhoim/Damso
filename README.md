<div align="center">

# 담소 · Damso

**음성·생성형 AI 기반 비동기 가족 소통 서비스**

![React Native](https://img.shields.io/badge/React%20Native-315B89?style=flat-square) ![Expo](https://img.shields.io/badge/Expo-315B89?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-315B89?style=flat-square) ![Three.js](https://img.shields.io/badge/Three.js-315B89?style=flat-square) ![FastAPI](https://img.shields.io/badge/FastAPI-315B89?style=flat-square) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-315B89?style=flat-square) ![CLOVA Speech](https://img.shields.io/badge/CLOVA%20Speech-315B89?style=flat-square) ![HyperCLOVA X](https://img.shields.io/badge/HyperCLOVA%20X-315B89?style=flat-square)

[Overview](#overview) · [Features](#features) · [Architecture](#architecture) · [Tech Stack](#tech-stack) · [How to Run](#how-to-run)

</div>

---

## Overview

부모와 자녀가 역할별 질문에 답하고 서로의 이야기를 각자의 시간에 읽는 가족 소통 서비스입니다. 글 또는 음성으로 작성한 답변을 STT와 LLM으로 정리하고 작성자가 확인한 이야기를 디지털 서재에 보관합니다. 가족 관계와 기록의 접근 권한, 원문 및 원음의 공개 여부를 분리하여 관리합니다.

## Features

| 기능 | 설명 |
| --- | --- |
| 가족 연결 | 부모 1명·자녀 1명 초대 코드 연결, 역할 및 호칭 관리 |
| 일일 질문 | 기본·개별·AI 꼬리질문 및 가족 예약 질문, 사용자별 하루 최대 3개 |
| 음성 및 글 | 녹음·업로드, CLOVA Speech 전사, HCX-007 제목 및 1인칭 요약 |
| AI 작업 관리 | 처리 상태, 재시도, 재답변, 건너뛰기 및 작성자 확인 후 공개 |
| 기억의 서재 | 날짜·작성자 필터, 이야기 상세, 원문·원음 재생 |
| 사진 및 3D | 이야기 사진 등록·확대, 가족 앨범, 3D 책·액자 탐색 |
| 개인정보 제어 | 가족별 접근 권한, 원문·원음 독립 공유 및 해제 |
| 소통 API | 댓글·공감·앱 내부 알림 |

답변은 작성자가 제출하면 즉시 공개되며 상대의 답변을 기다리지 않습니다. 미공개 AI 초안과 재답변 이력은 가족에게 제공하지 않습니다. 3D 액자 표면은 예시 이미지이며 실제 가족 사진으로 자동 교체하지 않습니다. TTS·음성 클로닝과 OS 푸시, 일부 가입·연결 UI 통합은 현재 지원 범위와 구분됩니다.

## Architecture

~~~mermaid
flowchart TD
  APP["Expo / React Native"] --> API["FastAPI REST API"]
  APP --> WEB["Three.js 서재 / iframe 또는 WebView"]
  API --> DB["PostgreSQL"]
  API --> FS["비공개 음성 및 사진 파일"]
  API --> J["DB 작업 큐 / AI Worker"]
  J --> STT["CLOVA Speech"]
  STT --> LLM["HCX-007 요약"]
  LLM --> DB
  DB --> API
  API --> APP
~~~

| Path | Responsibility |
| --- | --- |
| `damso-mobile/` | 모바일 앱 및 웹 미리보기 |
| `damso-library/` | React Three Fiber 기반 3D 서재 |
| `damso-server/backend/` | 계정·가족·질문·답변 API, AI 워커, 마이그레이션 |
| `scripts/` | 로컬 미리보기 실행 |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Mobile | React Native, Expo, Expo Router, TypeScript |
| 3D | Three.js, React Three Fiber, Vite, GLB |
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Data | PostgreSQL, 비공개 파일 저장 |
| AI | CLOVA Speech, HyperCLOVA X HCX-007 |
| Security | JWT, Argon2, 가족별 권한 검사 |

## How to Run

### 1. Prerequisites

Windows 로컬 실행 기준 Python 3.14, uv, Node.js/npm과 Git을 준비합니다.

~~~powershell
git clone https://github.com/Hyunhoim/Damso.git
cd Damso
~~~

### 2. Backend

~~~powershell
cd damso-server/backend
uv sync --python 3.14
.venv/Scripts/python.exe -X utf8 scripts/run-local.py
~~~

로컬 실행 도우미가 PostgreSQL, 마이그레이션, API 및 AI 워커를 준비합니다. API는 http://127.0.0.1:8000/docs 에서 확인하고, STT·LLM 키는 http://127.0.0.1:8000/dev/llm 에서 등록합니다. PostgreSQL 기본 포트는 5433입니다.

### 3. Mobile & 3D Preview

별도 터미널에서 저장소 루트를 기준으로 실행합니다.

~~~powershell
cd damso-library
npm ci
cd ../damso-mobile
npm ci
cd ..
powershell -ExecutionPolicy Bypass -File scripts/start-damso-preview.ps1
~~~

- 앱 미리보기: http://localhost:8081
- 3D 서재: http://localhost:5174
- 실제 기기에서는 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_LIBRARY_3D_URL`을 접근 가능한 주소로 설정합니다. AI 키 및 DB 비밀번호를 Expo 공개 변수에 넣지 않습니다.

### 4. Development Checks

~~~bash
cd damso-mobile
npm test
npm run typecheck
npm run lint
npm run export:web
cd ../damso-library
npm run build
~~~

[모바일 가이드](damso-mobile/README.md) · [3D 서재](damso-library/README.md) · [백엔드 실행 가이드](damso-server/backend/RUNBOOK.md) · [API 계약](damso-server/backend/API_CONTRACT.md)
