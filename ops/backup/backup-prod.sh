#!/usr/bin/env bash
# #8 — 한미르톡 운영 백업 스크립트.
#
# 단일 VM Docker Compose 배포(N-0 결정)에서 한 번 호출로 DB + 업로드를
# 같은 타임스탬프 디렉터리에 묶어 보관한다. 운영 VM 의 root cron 으로
# 등록해 매일 1회 실행하는 것을 권장한다 (docs/20 R-7 참고).
#
# 사용:
#   # 1) 기본값(대부분 그대로 가능):
#   sudo bash ./ops/backup/backup-prod.sh
#
#   # 2) 환경변수 오버라이드:
#   BACKUP_ROOT=/mnt/nas/hanmir RETENTION_DAYS=30 \
#     sudo bash ./ops/backup/backup-prod.sh
#
# 실행 방식 메모:
#   - cron/manual 모두 `bash <path>` 형태로 호출하는 것을 권장 — 실행 비트
#     (chmod +x) 가 없어도 동작한다. Windows git(core.filemode=false)에서
#     clone 한 리포지토리는 실행 비트를 보존하지 못할 수 있으므로 안전.
#   - 편의상 한 번 `chmod +x ops/backup/backup-prod.sh` 해두면 직접 호출도
#     가능하지만, 절차상 의존하지 않는 게 좋다.
#
# 안전:
#   - 복원(restore) 명령은 절대 포함하지 않는다 — 복원은
#     ops/backup/RESTORE_REHEARSAL.md 의 수동 절차로만.
#   - 보존 정책(retention) 삭제 전에 BACKUP_ROOT 가 안전한 값인지
#     이중 검증.

set -Eeuo pipefail

# ── 기본값 + 환경 override ─────────────────────────────────────────────
ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_ROOT="${BACKUP_ROOT:-/srv/hanmir-talk/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT%/}/${TIMESTAMP}"

# ── 로깅 헬퍼 ──────────────────────────────────────────────────────────
log() {
  printf '[backup %s] %s\n' "$(date '+%H:%M:%S')" "$*"
}
pass() {
  printf '[backup] PASS  %s\n' "$*"
}
fail() {
  printf '[backup] FAIL  %s\n' "$*" >&2
}

on_error() {
  fail "백업 중단 (exit $?, line ${BASH_LINENO[0]})"
  # 미완성 디렉터리 흔적 — 운영자가 식별 가능하도록 .failed 표시만 추가.
  if [[ -d "$BACKUP_DIR" ]]; then
    touch "$BACKUP_DIR/.failed" 2>/dev/null || true
  fi
  exit 1
}
trap on_error ERR

# ── 1) 의존성·파일 검증 ────────────────────────────────────────────────
log "한미르톡 운영 백업 시작 — ${TIMESTAMP}"

for cmd in docker gzip tar find date awk grep cut sed; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "필수 명령 누락: $cmd"
    exit 1
  fi
done

if [[ ! -f "$ENV_FILE" ]]; then
  fail "ENV_FILE 미존재: $ENV_FILE  (cwd=$(pwd))"
  exit 1
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
  fail "COMPOSE_FILE 미존재: $COMPOSE_FILE  (cwd=$(pwd))"
  exit 1
fi

# Compose v2 plugin 확인 — `docker compose` (공백) 형태.
if ! docker compose version >/dev/null 2>&1; then
  fail "'docker compose' (compose-plugin) 가 사용 가능해야 합니다"
  exit 1
fi

# ── 2) 안전한 BACKUP_ROOT 가드 ─────────────────────────────────────────
case "$BACKUP_ROOT" in
  "" | "/" | "/home" | "/root" | "/etc" | "/var" | "/usr" | "/tmp")
    fail "BACKUP_ROOT 가 안전하지 않은 경로: '$BACKUP_ROOT'"
    exit 1
    ;;
esac
if [[ "$BACKUP_ROOT" != /* ]]; then
  fail "BACKUP_ROOT 는 절대경로여야 합니다: '$BACKUP_ROOT'"
  exit 1
fi

# 디렉터리 준비.
mkdir -p "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"
log "백업 디렉터리: $BACKUP_DIR"

# ── 3) .env.prod 에서 UPLOAD_DIR_HOST 추출 (env 우선) ─────────────────
# source 로 그대로 실행하지 않는다 (보안) — 값만 grep 으로 안전 추출.
read_env_value() {
  local key="$1"
  # 주석/공백 제거, 따옴표 제거. 첫 매치만.
  grep -E "^[[:space:]]*${key}=" "$ENV_FILE" \
    | head -n1 \
    | sed -E "s/^[[:space:]]*${key}=//; s/^['\"]//; s/['\"]$//"
}

UPLOAD_DIR_HOST="${UPLOAD_DIR_HOST:-$(read_env_value UPLOAD_DIR_HOST || true)}"
if [[ -z "${UPLOAD_DIR_HOST}" ]]; then
  fail "UPLOAD_DIR_HOST 가 비어 있습니다 (env or $ENV_FILE)"
  exit 1
fi

# 업로드 디렉터리 안전성 — / · 빈 값 · 상대경로 거부.
case "$UPLOAD_DIR_HOST" in
  "" | "/" | "." | "..")
    fail "UPLOAD_DIR_HOST 가 안전하지 않은 값: '$UPLOAD_DIR_HOST'"
    exit 1
    ;;
esac
if [[ "$UPLOAD_DIR_HOST" != /* ]]; then
  fail "UPLOAD_DIR_HOST 는 절대경로여야 합니다: '$UPLOAD_DIR_HOST'"
  exit 1
fi
if [[ ! -d "$UPLOAD_DIR_HOST" ]]; then
  fail "UPLOAD_DIR_HOST 디렉터리 없음: $UPLOAD_DIR_HOST"
  exit 1
fi

# ── 4) PostgreSQL 덤프 → gzip → 원자적 이동 ─────────────────────────
log "PostgreSQL pg_dump 시작"
DB_FINAL="${BACKUP_DIR}/db.sql.gz"
DB_TMP="${BACKUP_DIR}/db.sql.gz.tmp"

# pg_dump 는 컨테이너 안에서 실행 (호스트에 psql 클라이언트 불필요).
# POSTGRES_USER/DB 는 컨테이너 환경에 이미 박혀 있으므로 sh -c 안에서
# 그대로 참조 — 호스트 쉘에 export 할 필요 없음.
#
# 플래그:
#   --clean --if-exists  복원 시 기존 객체를 먼저 DROP (마이그 001~017 이
#                        먼저 적용된 DB 에 그대로 복원해도 충돌 안 함 —
#                        RESTORE_REHEARSAL.md 의 빈 컨테이너 부팅 + initdb
#                        + dump 흐름을 지원).
#   --no-owner --no-acl  복원 환경의 role 이름이 달라도 깨지지 않게.
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
      sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' \
      | gzip -c > "$DB_TMP"; then
  fail "pg_dump 실패 — 컨테이너 로그를 확인하세요 (docker compose logs postgres)"
  exit 1
fi

# 최소 크기 sanity check — gzip empty stream(약 20 bytes) 미만이면 실패로 간주.
DB_TMP_SIZE=$(stat -c%s "$DB_TMP" 2>/dev/null || stat -f%z "$DB_TMP")
if (( DB_TMP_SIZE < 64 )); then
  fail "pg_dump 결과가 너무 작습니다 (${DB_TMP_SIZE} bytes) — 손상 가능성"
  rm -f "$DB_TMP"
  exit 1
fi

# 원자적 rename — 동일 파일시스템 안의 mv 는 원자적.
mv -f "$DB_TMP" "$DB_FINAL"
pass "db.sql.gz  (${DB_TMP_SIZE} bytes)"

# ── 5) 업로드 디렉터리 tar.gz ──────────────────────────────────────
log "업로드 디렉터리 tar 시작: ${UPLOAD_DIR_HOST}"
UPLOADS_FINAL="${BACKUP_DIR}/uploads.tar.gz"
UPLOADS_TMP="${BACKUP_DIR}/uploads.tar.gz.tmp"

# -C 로 부모 디렉터리로 이동 후 basename 만 archive — 복원 시 같은 이름의
# 디렉터리가 재현되도록.
UPLOAD_PARENT="$(dirname "$UPLOAD_DIR_HOST")"
UPLOAD_BASE="$(basename "$UPLOAD_DIR_HOST")"

if ! tar -czf "$UPLOADS_TMP" -C "$UPLOAD_PARENT" "$UPLOAD_BASE"; then
  fail "uploads tar 실패"
  rm -f "$UPLOADS_TMP"
  exit 1
fi
UP_SIZE=$(stat -c%s "$UPLOADS_TMP" 2>/dev/null || stat -f%z "$UPLOADS_TMP")
mv -f "$UPLOADS_TMP" "$UPLOADS_FINAL"
pass "uploads.tar.gz  (${UP_SIZE} bytes)"

# ── 6) manifest 작성 ──────────────────────────────────────────────
log "manifest 작성"
MANIFEST="${BACKUP_DIR}/manifest.txt"
GIT_COMMIT="unknown"
if command -v git >/dev/null 2>&1 && git rev-parse --short HEAD >/dev/null 2>&1; then
  GIT_COMMIT="$(git rev-parse --short HEAD)"
fi

# 안전한 출력만 — 비밀번호 등은 절대 manifest 에 쓰지 않는다.
cat > "$MANIFEST" <<EOF
Hanmir Talk 운영 백업 manifest
================================
timestamp:        ${TIMESTAMP}
git_commit:       ${GIT_COMMIT}
compose_file:     ${COMPOSE_FILE}
env_file:         ${ENV_FILE}
upload_dir_host:  ${UPLOAD_DIR_HOST}
backup_dir:       ${BACKUP_DIR}

artifacts
---------
db.sql.gz         ${DB_TMP_SIZE} bytes
uploads.tar.gz    ${UP_SIZE} bytes

restore
-------
복원은 절대 운영 환경에 직접 실행하지 마세요.
ops/backup/RESTORE_REHEARSAL.md 의 절차에 따라 별도 VM 에서만 수행.
EOF
pass "manifest.txt"

# ── 7) Retention — RETENTION_DAYS 이전 백업 정리 ───────────────────
log "retention 정리 (>${RETENTION_DAYS}일 경과 백업 삭제)"

# BACKUP_ROOT 가 위 가드를 통과했어도 한 번 더 — 삭제 직전이라 더 보수적으로.
case "$BACKUP_ROOT" in
  "" | "/" | "/home" | "/root" | "/etc" | "/var" | "/usr" | "/tmp")
    fail "retention 단계에서 BACKUP_ROOT 가 안전하지 않음: '$BACKUP_ROOT'"
    exit 1
    ;;
esac
if [[ "$BACKUP_ROOT" != /* ]]; then
  fail "retention 단계에서 BACKUP_ROOT 가 절대경로가 아님"
  exit 1
fi

# 정확한 타임스탬프 디렉터리만 매칭 — YYYYMMDD-HHMMSS 형태.
#   "20??????-??????" = "20" + 6자리 날짜 + "-" + 6자리 시각.
# 사용자가 영구 보관용으로 "20260526-103045-keep" 처럼 suffix 를 붙이면
# 본 패턴에 매치되지 않으므로 retention 에서 제외된다.
PURGED=0
while IFS= read -r -d '' old; do
  rm -rf -- "$old"
  PURGED=$((PURGED + 1))
done < <(find "$BACKUP_ROOT" -maxdepth 1 -type d \
              -name "20??????-??????" \
              -mtime "+${RETENTION_DAYS}" -print0 2>/dev/null || true)

pass "retention: ${PURGED}개 디렉터리 정리"

# ── 8) 요약 ─────────────────────────────────────────────────────────
log "백업 완료 — ${BACKUP_DIR}"
pass "ALL OK  ($(du -sh "$BACKUP_DIR" 2>/dev/null | awk '{print $1}'))"
exit 0
