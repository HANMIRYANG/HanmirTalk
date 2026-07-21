// Proxy-chain integration용 앱 부트 — memory 어댑터로 4000 포트에 기동.
// test-proxy-chain.sh 가 docker 네트워크에서 network-alias `server` 로 띄워
// 실제 운영 Caddyfile(reverse_proxy server:4000)이 그대로 동작하게 한다.
//
// createApp 앞단에 트러스트 설정을 공유하는 얇은 래퍼를 두고, Express 가
// 최종 판정한 req.ip 를 그대로 돌려주는 검증 전용 echo 라우트를 추가한다
// (운영 app.ts 에는 존재하지 않는 테스트 전용 표면 — /api/* 라 Caddy 가
// server 로 라우팅한다).
import express from "express";

async function main(): Promise<void> {
  const { createApp } = await import("../src/app");
  const { createMemoryRepositories } = await import("../src/repositories/memory");
  const { config } = await import("../src/config");

  const outer = express();
  outer.set("trust proxy", config.trustProxyHops);
  outer.get("/api/v1/__test-ip", (req, res) => {
    res.json({ ip: req.ip ?? null });
  });
  outer.use(createApp({ repos: createMemoryRepositories() }));

  outer.listen(4000, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`[serve-test-app] listening on 4000 (trust proxy hops=${config.trustProxyHops})`);
  });
}

void main();
