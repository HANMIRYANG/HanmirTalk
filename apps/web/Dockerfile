# 한미르톡 웹 (Next.js 14) — 멀티스테이지 + standalone 출력.
# 빌드 컨텍스트 = 레포 루트.
# 단독 빌드 시:
#   docker build -f apps/web/Dockerfile -t hanmir-web \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://<도메인>/api/v1 .

# ---- builder ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
RUN npm ci

# 웹 빌드는 @hanmir/shared 소스를 transpilePackages 로 인라인 — 소스만 필요.
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# 브라우저 번들에 인라인되는 공개 API URL — 빌드 시점에 고정된다.
# (웹 컨테이너의 SSR 은 런타임 env API_BASE_URL 을 따로 쓴다 — api-client.ts)
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build -w @hanmir/web

# ---- runner: standalone 출력만 ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# 컨테이너 밖(Caddy)에서 접근 가능하도록 0.0.0.0 바인드 (기본값 localhost).
ENV HOSTNAME=0.0.0.0

# standalone = 추적된 최소 node_modules + apps/web/server.js.
# static·public 은 standalone 에 포함되지 않아 따로 복사한다.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
