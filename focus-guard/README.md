# FocusGuard

FocusGuard는 공부나 업무 중 불필요한 웹사이트 사용을 줄이기 위한 Chrome Extension입니다. 집중 모드를 켜면 등록된 차단 사이트별로 현재 접속 세션 기준 10분만 사용할 수 있고, 시간이 지나면 차단 안내 페이지로 이동합니다.

## 기술 스택

- TypeScript
- React
- Vite
- Chrome Extension Manifest V3
- Chrome Storage API
- Chrome Alarms API
- Chrome Notifications API

## 주요 기능

- 집중 모드 ON/OFF
- 기본 차단 사이트 제공
- 차단 사이트 추가 및 삭제
- 설정값을 `chrome.storage.local`에 저장
- 차단 사이트별 현재 탭 세션 기준 10분 사용 제한
- popup에서 진행 중인 세션의 남은 시간 표시
- 제한 시간 1분 전 Chrome 알림 표시
- 제한 시간 초과 시 `blocked.html`로 이동
- 차단 화면에서 차단 도메인, 현재 시간, 랜덤 공부 자극 멘트 표시

## 설치 방법

```bash
npm install
```

## 개발 방법

```bash
npm run dev
```

개발 중에는 Vite dev server로 React 화면을 확인할 수 있습니다. Chrome Extension 동작 검증은 빌드 후 `dist` 폴더를 Chrome에 로드해서 확인합니다.

## 빌드

```bash
npm run build
```

빌드 결과물은 `dist` 폴더에 생성됩니다.

## Chrome에서 dist 폴더 로드하기

1. `npm run build`를 실행합니다.
2. Chrome에서 `chrome://extensions`를 엽니다.
3. 우측 상단의 개발자 모드를 켭니다.
4. 압축해제된 확장 프로그램을 로드합니다를 선택합니다.
5. 이 프로젝트의 `focus-guard/dist` 폴더를 선택합니다.
6. 확장 프로그램 popup에서 집중 모드를 켜고 차단 사이트 접속을 확인합니다.

## 배포용 zip 생성

```bash
npm run package:zip
```

위 명령은 빌드를 실행한 뒤 `focus-guard.zip` 파일을 생성합니다. Chrome Web Store 등록 시 이 zip 파일을 업로드할 수 있습니다.

## npm scripts

- `npm run dev`: Vite 개발 서버 실행
- `npm run lint`: ESLint 검사
- `npm run build`: TypeScript 빌드 및 Vite 번들 생성
- `npm run preview`: 빌드 결과 preview
- `npm run package:zip`: `dist` 폴더를 배포용 zip으로 패키징

## 배포 전 확인 사항

- `npm run lint` 통과
- `npm run build` 통과
- Chrome에서 `dist` 폴더 로드 후 popup, 알림, 차단 페이지 동작 확인
- Chrome Web Store 등록 정보와 스크린샷 준비
