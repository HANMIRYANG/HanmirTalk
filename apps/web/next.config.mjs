import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 모노레포 루트 (apps/web → ../../). standalone 파일 추적 기준점.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hanmir/shared"],
  // 운영 Docker 이미지를 위한 standalone 출력 — 추적된 최소 node_modules +
  // apps/web/server.js 만 .next/standalone 으로 떨어진다 (멀티스테이지
  // runner 단계가 이것만 복사). apps/web/Dockerfile 참고.
  output: "standalone",
  experimental: {
    typedRoutes: false,
    // 모노레포: 파일 추적 루트를 레포 루트로 고정 (lockfile 자동탐지 보강).
    outputFileTracingRoot: repoRoot
  }
};

export default nextConfig;
