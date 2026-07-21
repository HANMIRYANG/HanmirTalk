# 14. 보안 정책

## 인증

- 비밀번호 해시 저장
- access token 짧은 만료 시간
- refresh token rotation 고려
- 비활성화 계정 로그인 차단
- 로그인 rate limit (IP+계정 기준, in-app 구현)

### 클라이언트 IP 판정 (rate limit·감사 로그 공통)

- 신뢰 경계: Cloudflare Edge → cloudflared(호스트) → Caddy(127.0.0.1:80) → Express
- 실제 방문자 IP 는 Cloudflare 가 엣지에서 강제 설정하는 `CF-Connecting-IP` 만 사용
  (Caddyfile `trusted_proxies` + `client_ip_headers`, Caddy 2.8+)
- Caddy 는 upstream 으로 `X-Forwarded-For` 를 `{client_ip}` **단일 값으로 덮어써** 전달 —
  방문자가 보낸 XFF 체인은 Express 에 도달하지 않는다
- Express 는 `TRUST_PROXY_HOPS`(운영 1 = Caddy 한 홉, dev 기본 0 = XFF 전면 무시)로
  `req.ip` 를 판정하고, 모든 소비처(로그인 리미터·SSO 리미터·감사 로그)는
  `server/src/auth/client-ip.ts` 의 단일 함수를 사용한다.
  **`req.headers["x-forwarded-for"]` 직접 파싱 금지.**
- 잔여 위험: 리미터는 in-app 단일 프로세스 전제 — Express 다중 인스턴스로
  확장하면 Redis 등 공유 저장소 기반으로 교체해야 한다.

## 권한

- API마다 사용자 권한 확인
- 프로젝트/채팅방 멤버십 확인
- 관리자 기능은 role 기반 접근 제어

## 파일

- 권한 없는 파일 접근 차단
- 실행 파일 업로드 금지
- 파일명 sanitize
- 파일 크기 제한

## 감사 로그

다음 작업은 로그를 남긴다.

- 관리자 로그인
- 계정 생성/비활성화
- 프로젝트 생성/수정/삭제
- 공지 생성/삭제
- 결정사항 생성/수정/삭제
- 파일 삭제

## 데이터 보호

- DB 백업 정책 필요
- 내부망 배포 시에도 HTTPS 권장
- 민감 정보는 환경변수로 관리
