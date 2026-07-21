#!/bin/sh
# Cloudflare → cloudflared → Caddy → Express 체인 통합 테스트 오케스트레이션.
#
# 실제 운영 Caddyfile 을 그대로 마운트한 caddy:2-alpine + memory 어댑터
# Express(serve-test-app.ts) 를 일회용 docker 네트워크에 띄우고, 세 번째
# 컨테이너(운영에서 cloudflared 가 앉는 신뢰 피어 자리)에서
# test-proxy-chain.ts 를 실행한다. 운영 스택과 이름·포트가 겹치지 않으며
# 종료 시 전부 정리된다.
#
# 사용: sh server/scripts/test-proxy-chain.sh   (repo 루트에서)
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NET=hanmir-proxy-test-net
APP=hanmir-proxy-test-app
CADDY=hanmir-proxy-test-caddy
# 테스트 전용 더미 클라이언트 — 실제 자격증명 아님 (test-sso.ts 와 동일 값).
SSO_CLIENTS_JSON='[{"clientId":"hanmir-erp-test","name":"HanmirERP (test)","secretSha256":"'"$(printf %s "test-only-dummy-secret-not-real-0000000000" | sha256sum | cut -d" " -f1)"'","redirectUris":["https://erp.test.example/auth/sso/callback"]}]'

cleanup() {
  docker rm -f "$APP" "$CADDY" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker network create "$NET" >/dev/null

docker run -d --name "$APP" --network "$NET" --network-alias server \
  -u "$(id -u):$(id -g)" -v "$REPO":/app -w /app -e HOME=/tmp \
  -e TRUST_PROXY_HOPS=1 \
  -e SSO_CLIENTS="$SSO_CLIENTS_JSON" \
  node:20-alpine npx tsx server/scripts/serve-test-app.ts >/dev/null

# 운영과 동일 이미지·동일 Caddyfile. web:3000 upstream 은 이 네트워크에
# 없지만 테스트는 /api/* 만 지나므로 기동에 지장 없다.
docker run -d --name "$CADDY" --network "$NET" --network-alias caddy \
  -v "$REPO"/Caddyfile:/etc/caddy/Caddyfile:ro \
  caddy:2-alpine >/dev/null

if docker run --rm --network "$NET" \
  -u "$(id -u):$(id -g)" -v "$REPO":/app -w /app -e HOME=/tmp \
  -e TARGET=http://caddy:80 \
  node:20-alpine npx tsx server/scripts/test-proxy-chain.ts; then
  rc=0
else
  rc=$?
  echo "--- app logs ---"
  docker logs "$APP" 2>&1 | tail -20
  echo "--- caddy logs ---"
  docker logs "$CADDY" 2>&1 | tail -20
fi
exit $rc
