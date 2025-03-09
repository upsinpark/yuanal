# YuViewer - Playboard.co 한국 숏폼 동영상 순위 크롤러

이 프로그램은 [Playboard.co](https://playboard.co/chart/short/most-viewed-all-videos-in-south-korea-daily)에서 한국 숏폼 동영상 순위를 크롤링하여 JSON 파일로 저장하는 도구입니다.

## 기능

- 한국 숏폼 동영상 일간 인기 순위 크롤링 (최대 200위까지)
- 로그인 기능 지원 (100위 이상 크롤링 시 필요)
- 진행 상황 실시간 표시
- 결과를 JSON 파일로 저장
- 사용자 친화적인 CLI 인터페이스

## 설치 방법

### 개발자 모드로 실행

1. Node.js가 설치되어 있어야 합니다. (v14 이상 권장)
2. 다음 명령어로 필요한 패키지를 설치합니다:

```bash
npm install
```

3. `.env` 파일을 수정하여 설정을 변경할 수 있습니다.
4. 다음 명령어로 프로그램을 실행합니다:

```bash
npm start
```

### 실행 파일로 사용

1. 다음 명령어로 실행 파일을 빌드합니다:

```bash
npm run build
```

2. `dist` 폴더에 생성된 실행 파일을 실행합니다.

## 환경 설정 (.env 파일)

```
# Playboard 계정 정보 (로그인이 필요한 경우)
PLAYBOARD_EMAIL=your_email@example.com
PLAYBOARD_PASSWORD=your_password

# 크롤링 설정
MAX_RANK=200  # 최대 200위까지 크롤링 (로그인하지 않으면 100위까지만 가능)
OUTPUT_FILE=playboard_rankings.json  # 결과 저장 파일명

# 브라우저 설정
HEADLESS=false  # true: 브라우저 화면 숨김, false: 브라우저 화면 표시
```

## 주의사항

- 로그인 없이는 100위까지만 크롤링이 가능합니다.
- 로그인 정보는 `.env` 파일에 저장하거나 프로그램 실행 시 입력할 수 있습니다.
- 웹사이트 구조가 변경되면 크롤링이 실패할 수 있습니다.
- 과도한 크롤링은 IP 차단의 원인이 될 수 있으니 적절히 사용하세요.

## 결과 예시

```json
[
  {
    "rank": 1,
    "title": "비디오 제목",
    "channel": "채널명",
    "views": "1.2M views",
    "thumbnail": "https://example.com/thumbnail.jpg",
    "videoUrl": "https://playboard.co/video/...",
    "channelUrl": "https://playboard.co/channel/...",
    "crawledAt": "2023-05-01T12:34:56.789Z"
  },
  ...
]
```

## 라이선스

MIT 