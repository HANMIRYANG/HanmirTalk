# 09. 연동 API / 외부 서비스 정리

## 필수 연동

### 1. WebSocket / Socket.IO

목적:

- 실시간 메시지 송수신
- 읽음 처리
- 타이핑 표시
- 공지/업무 알림

추천:

- NestJS Gateway + Socket.IO

### 2. PostgreSQL

목적:

- 사용자, 메시지, 프로젝트, 업무, 제품, 파일 메타데이터 저장

### 3. Redis

목적:

- 세션/토큰 캐시
- WebSocket presence 상태
- 알림 큐
- rate limiting

초기 MVP에서는 선택 가능하지만, 실시간성과 확장성을 위해 권장한다.

### 4. 파일 스토리지

선택지:

- 사내 NAS
- S3 호환 스토리지 MinIO
- AWS S3
- Cloudflare R2

내부 사내 시스템이면 MinIO 또는 NAS 연동을 우선 고려한다.

필요 기능:

- 파일 업로드
- 파일 다운로드
- 파일 접근 권한 검사
- 이미지 미리보기
- 파일 크기 제한

### 5. Push Notification

목적:

- 모바일 PWA 알림
- PC 브라우저 알림

후보:

- Web Push API
- Firebase Cloud Messaging

주의:

- iOS PWA 푸시 알림은 환경과 버전에 따라 제약이 있을 수 있으므로 별도 테스트 필요

## 선택 연동

### 1. 이메일 SMTP

용도:

- 비밀번호 초기화
- 공지 이메일 발송
- 계정 생성 안내

### 2. SMS/카카오 알림톡

용도:

- 초기 비밀번호 안내
- 중요 공지 알림

초기 MVP에서는 비용과 복잡도를 고려하여 제외 가능.

### 3. Google Drive / Workspace

용도:

- 기존 회사 파일 체계와 연동

초기에는 자체 파일함을 우선 구현하고 이후 검토한다.

### 4. Calendar API

용도:

- 프로젝트 마감일/업무 일정 캘린더 연동

MVP 이후 확장 기능.

### 5. AI / LLM Provider (`/` 명령어용)

채팅 입력창의 `/` AI 명령어 (`/요약`, `/정리`, `/업무추출`, `/결정사항`, `/공지초안`, `/회의록`)를 처리하기 위한 LLM provider 연동.

후보:

- Anthropic Claude API
- OpenAI API
- 사내 LLM gateway (사내망 한정 운영 시)

용도:

- 채팅방 최근 메시지 요약
- 대화 → 업무/결정사항 후보 추출
- 공지 초안 / 회의록 초안 생성
- 첨부 파일(텍스트성)에 한해 내용 요약

연동 원칙:

- LLM 호출은 항상 백엔드를 통해서만 수행. 클라이언트에서 직접 외부 LLM API key를 노출하지 않는다.
- 호출 직전 백엔드는 다음을 보장:
  - 요청한 사용자가 접근 권한이 있는 메시지/파일/프로젝트만 context로 포함
  - 파일 원문 사용 시 파일 접근 권한 재확인
  - 회사 외부 송출에 민감한 정보는 정책에 따라 마스킹/거부 (`14_SECURITY_POLICY.md`와 정책 연동)
- 응답은 자동으로 채팅에 전송되지 않고, 클라이언트에 미리보기로 전달 → 사용자 확정 후에만 메시지/업무/결정사항이 생성
- 모든 AI 호출은 감사 로그에 (`user_id`, `command`, `scope`, `timestamp`, `token_usage`) 기록
- rate limit / 비용 한도(사용자별, 채팅방별) 설정 가능하게 설계

관련 API 후보 (`08_API_SPEC.md`에서 상세):

- `GET /api/v1/mentions/search?q=` — `@` 멘션/태그 통합 검색 (사용자/부서/프로젝트/업무/파일)
- `GET /api/v1/ai/commands` — 사용 가능한 `/` 명령어 메타데이터
- `POST /api/v1/ai/chat-summary` — `/요약`
- `POST /api/v1/ai/extract-tasks` — `/업무추출`
- `POST /api/v1/ai/extract-decisions` — `/결정사항`
- `POST /api/v1/ai/draft-notice` — `/공지초안`
- `POST /api/v1/ai/minutes` — `/회의록`

MVP 포함 여부:

- 사용자 멘션용 `GET /mentions/search`: MVP 포함 가능 (사용자 검색만)
- AI provider 연동: MVP+ 권장. 데모 가치가 중요하면 `/요약` 한 가지만 제한적으로 MVP에 포함 가능

## 연동 우선순위

1. PostgreSQL
2. WebSocket / Socket.IO
3. 파일 스토리지
4. PWA Service Worker
5. Web Push
6. Redis
7. SMTP/SMS
8. Google Drive/Calendar
9. AI / LLM Provider (MVP+)
