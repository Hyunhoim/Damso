<div align="center">

# 담소 · Damso

**AI 기반 비동기 가족 소통 서비스**

![React Native](https://img.shields.io/badge/React%20Native-315B89?style=flat-square) ![Expo](https://img.shields.io/badge/Expo-315B89?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-315B89?style=flat-square) ![FastAPI](https://img.shields.io/badge/FastAPI-315B89?style=flat-square) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-315B89?style=flat-square) ![CLOVA Speech](https://img.shields.io/badge/CLOVA%20Speech-315B89?style=flat-square) ![HyperCLOVA X](https://img.shields.io/badge/HyperCLOVA%20X-315B89?style=flat-square) ![Three.js](https://img.shields.io/badge/Three.js-315B89?style=flat-square)

[Overview](#overview) · [Features](#features) · [Architecture](#architecture) · [Documentation](#documentation)

</div>

---

## Overview

부모와 자녀가 질문에 답하고 서로의 이야기를 각자의 시간에 읽는 가족 소통 앱입니다.

## Features

- 역할별 질문과 AI 꼬리질문
- 음성 전사 및 1인칭 요약, 작성자 확인 후 공개
- 원문·원음 공유 제어와 가족별 접근 권한
- 사진 앨범 및 인터랙티브 3D 서재

## Architecture

```mermaid
flowchart LR
 A[모바일 앱] --> B[FastAPI]
 B --> C[STT]
 C --> D[LLM 요약]
 D --> E[작성자 확인]
 E --> F[가족 서재]
```

## Tech Stack

React Native · Expo · TypeScript · FastAPI · PostgreSQL · CLOVA Speech · HyperCLOVA X · Three.js

## Project Status

2026-10-21 기록 기준 서버 테스트 85개, 모바일 테스트 9개 통과. 실제 기기 검증, 외부 배포, TTS 및 OS 푸시는 후속 작업입니다.

## Documentation

[모바일](damso-mobile/README.md) · [3D 서재](damso-library/README.md) · [서버 실행](damso-server/backend/RUNBOOK.md) · [API 명세](damso-server/backend/API_CONTRACT.md)

- [상세 개발·실행 안내 및 기존 README](README_DEVELOPMENT.md)
