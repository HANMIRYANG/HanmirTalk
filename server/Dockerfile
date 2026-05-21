# 한미르톡 API 서버 (Express + socket.io) — 멀티스테이지 빌드.
# 빌드 컨텍스트 = 레포 루트 (docker-compose.prod.yml 가 context: . 로 지정).
# 단독 빌드 시:
#   docker build -f server/Dockerfile -t hanmir-server .

# ---- builder: 워크스페이스 설치 + shared·server 컴파일 ----
FROM node:20-alpine AS builder
WORKDIR /app

# package manifest 만 먼저 복사 → 소스만 바뀌면 npm ci 레이어 캐시를 재사용.
# npm ci 는 lockfile 의 워크스페이스 집합 전체를 검증하므로 web 의
# package.json 도 함께 둔다.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# 소스 복사 후 빌드. shared 를 먼저 — server 런타임이 @hanmir/shared 의
# dist 를 require 한다 (tsconfig paths 는 컴파일타임 전용).
COPY packages/shared ./packages/shared
COPY server ./server
RUN npm run build -w @hanmir/shared \
 && npm run build -w @hanmir/server

# ---- runner: 운영 의존성 + 빌드 산출물만 ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 운영 의존성만 설치 (devDependencies·TS 툴체인 제외). lockfile 검증 때문에
# web 의 package.json 도 필요 — web 런타임 의존성이 함께 깔리지만(미사용)
# 사내 규모(20인)에선 무시 가능한 수준.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev && npm cache clean --force

# 빌드 산출물: server·shared 모두 dist 만. node_modules/@hanmir/shared
# 워크스페이스 심링크가 packages/shared/dist 를 가리킨다.
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/server/dist ./server/dist

# 업로드 디렉터리 — 운영은 호스트 디스크를 /data/uploads 에 bind mount 하고
# UPLOAD_DIR 로 지정한다 (docker-compose.prod.yml 참고).
EXPOSE 4000
CMD ["node", "server/dist/server/src/index.js"]
