# 16. Claude Code 작업 지시서

## 역할

Claude Code는 한미르톡 프로젝트의 실제 구현 담당이다.

## 절대 원칙

1. UI를 새로 디자인하지 않는다.
2. `design-reference/html/`에 들어간 HTML 레퍼런스를 기준으로 구현한다.
3. HTML 레퍼런스의 레이아웃, 톤앤매너, 여백, 색상, 버튼 형태를 임의로 변경하지 않는다.
4. 서비스 화면의 모든 사용자-facing 텍스트는 한국어로 작성한다.
5. 코드, 함수명, API route, DB column은 영어 네이밍을 사용할 수 있다.
6. 기획서에 없는 기능을 임의로 추가하지 않는다.
7. 작업 전 구현 계획을 먼저 출력한다.
8. 작업 후 변경 파일 목록, 구현 내용, 테스트 방법을 출력한다.
9. Codex가 검토할 수 있도록 구조를 명확하게 유지한다.

## 기술 스택 (현재 구현 기준)

> 본 문서 초안에는 NestJS·Redis·MinIO가 권장으로 적혀 있었으나, 실제 구현은
> 사내 단일 VM 운영 전제(N-0 결정)에 맞춰 더 단순한 스택으로 굳어졌다.
> 신규 합류자는 아래를 기준으로 코드를 읽고 작업한다.

- Frontend: Next.js 14 (app router) · TypeScript · CSS Modules (Tailwind 미사용)
- Backend: **Express 4** · TypeScript · `express-async-errors` 중앙 에러 핸들러
- Realtime: **socket.io 4.x** (Express http 서버에 attach)
- DB: PostgreSQL 16 (`pg` driver 직접 사용, ORM 없음). 메모리 어댑터는 dev 기본
- Auth: 자체 세션 (in-memory access + DB refresh_tokens 회전), bcryptjs
- Cache/Queue: **없음**. 단일 VM 전제 — Redis 도입은 다중 인스턴스로 갈 때만
- File Storage: **호스트 디스크 bind mount** (`UPLOAD_DIR`). S3/MinIO 미사용
- Mail: nodemailer (dev: mailhog 컨테이너 / 운영: 사내 SMTP)
- LLM: Anthropic Claude (`@anthropic-ai/sdk`) — `/ai/*` 5종 명령
- Push: web-push (VAPID) — HTTPS 환경에서만 실 동작
- Deploy: Docker Compose (`docker-compose.prod.yml`) + Caddy 리버스 프록시

## 디자인 기준

- Claude Design HTML 레퍼런스가 최종 디자인 기준이다.
- 한미르 로고는 `assets/logo/hanmir-logo.png`를 사용한다.
- 로고가 묻히지 않도록 배경과 주변 UI를 과도하게 복잡하게 만들지 않는다.
- 톤앤매너는 깔끔하고 절제된 업무용 스타일이어야 한다.
