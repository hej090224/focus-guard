# FocusGuard Agent Guide

## Project Overview

FocusGuard는 공부 중 불필요한 웹사이트 사용을 제한하는 Chrome Extension이다.

## Tech Stack

* TypeScript
* React
* Vite
* Chrome Extension Manifest V3
* Chrome Storage API

## Core Features

* 집중 모드 ON/OFF
* 차단 사이트 추가/삭제
* 기본 차단 사이트 제공
* 설정값 chrome.storage.local 저장
* 사이트별 10분 세션 제한
* 제한 시간 초과 시 blocked.html로 이동
* 차단 화면에 차단 이유, 현재 시간, 랜덤 공부 자극 멘트 표시

## Development Rules

* TypeScript strict mode를 지킨다.
* any 사용을 피한다.
* React Functional Component와 Hook을 사용한다.
* 기능 단위로 파일을 분리한다.
* 중복 로직은 utils 또는 hooks로 분리한다.
* Chrome API 접근 로직은 직접 UI 컴포넌트에 넣지 않는다.
* 저장소 접근은 storage 계층을 통해 처리한다.
* background service worker는 차단 감지와 타이머 관리에 집중한다.
* popup은 설정 UI에 집중한다.
* blocked 페이지는 차단 안내 화면에 집중한다.
* 불필요한 주석은 작성하지 않는다.
* 코드 스타일은 기존 프로젝트 스타일을 따른다.

## Blocking Policy

* 집중 모드가 ON일 때만 차단 로직이 작동한다.
* 차단 사이트별로 10분 사용을 허용한다.
* 하루 누적 사용 시간이 아니라 현재 접속 세션 기준으로 계산한다.
* 탭 새로고침 시 타이머는 유지한다.
* 탭을 닫고 다시 접속하면 타이머는 새로 시작한다.
* 다른 차단 사이트로 이동하면 해당 사이트 기준으로 새 타이머를 시작한다.

## Default Blocked Sites

* youtube.com
* instagram.com
* naver.com
* x.com
* facebook.com
* tiktok.com

## Branch Convention

* main
* develop
* feature/*
* fix/*
* chore/*
* docs/*
* refactor/*

## Commit Convention

* feat: 새로운 기능 추가
* fix: 버그 수정
* refactor: 리팩토링
* chore: 설정, 빌드, 패키지 작업
* docs: 문서 수정
* style: UI 또는 스타일 수정

## Pull Request Rule

* PR은 작은 단위로 작성한다.
* 구현 내용을 작성한다.
* 빌드가 통과해야 merge한다.
