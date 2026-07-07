#!/usr/bin/env bash
# ops/bulk-import-files.sh
#
# 자료실(파일함) 대량 적재기 — 스테이징 디렉터리에 파일을 부서별 폴더 구조로
# 넣어두고 한 번에 attachments 행 + 디스크 파일을 만든다. 드래그앤드롭 없이
# 호스트에서 직접 적재한다.
#
# 동작 원리 (코드 기준):
#   - 파일이 자료실에 보이려면 (1) 디스크에 실제 파일이 있고 (2) attachments
#     행의 file_url 이 업로드 루트 기준 "상대경로" 여야 한다.
#       업로드 루트 = 컨테이너 /data/uploads  ⇄  호스트 $UPLOAD_DIR_HOST
#       (docker-compose.prod.yml 의 bind mount — 이 값은 .env.prod 에서 읽는다)
#   - 폴더에 "담기" = attachments.folder_id 를 해당 file_folders.id 로 설정.
#   - ⚠️ 최상위(부서) 폴더의 member_ids 는 "읽기"를 제한하지 않는다. member_ids
#     는 하위폴더 생성/업로드 같은 "쓰기 권한"에만 쓰이고, 부서 폴더 안의 파일은
#     로그인한 전 직원에게 보인다(자료실 '전체 파일' 포함). 특정 인원에게만
#     보이게 하려면 "비밀번호가 걸린 하위폴더"가 유일한 수단이다 (급여/인사 등
#     민감자료 주의).
#   - 최상위(부서) 폴더는 권한을 가지므로 이 스크립트는 자동 생성하지 않는다
#     (이미 있어야 함). 하위 폴더는 디렉터리 트리대로 자동 생성한다.
#
# 스테이징 레이아웃 예 ( $IMPORT_DIR ):
#   import/
#     경영지원실/                <- 최상위(부서) 폴더 이름과 정확히 일치해야 함
#       2026_사규.pdf            <- 경영지원실 폴더에 담김
#       인사/                    <- 하위 폴더 (없으면 자동 생성)
#         급여대장.xlsx
#     연구소/
#       실험데이터.xlsx
#
# 사용:
#   bash ops/bulk-import-files.sh              # DRY-RUN (계획만 출력, 아무것도 안 바꿈)
#   bash ops/bulk-import-files.sh --commit     # 실제 적재 (복사 + DB insert)
#   IMPORT_DIR=/path UPLOADER_EMAIL=... bash ops/bulk-import-files.sh --commit
#
# 재실행 안전(순차): (folder_id, file_name) 가 이미 있으면 건너뛴다. 동시 실행은
#   flock 으로 막는다 — 한 번에 하나만 돌도록.

set -euo pipefail

# ───────────────────────── 설정 (환경변수로 덮어쓰기 가능) ─────────────────────────
ENV_FILE="${ENV_FILE:-/srv/hanmir-talk/.env.prod}"

# .env.prod 에서 키 하나를 읽는다 (없으면 빈 문자열, set -e 안전).
env_get() {
  [ -r "$ENV_FILE" ] || return 0
  sed -nE "s/^$1=(.*)$/\1/p" "$ENV_FILE" 2>/dev/null | tail -1 | sed -E 's/[[:space:]]+$//'
}

DB_CONTAINER="${DB_CONTAINER:-hanmir-postgres}"
PGUSER="${POSTGRES_USER:-$(env_get POSTGRES_USER)}"; PGUSER="${PGUSER:-hanmir}"
PGDB="${POSTGRES_DB:-$(env_get POSTGRES_DB)}"; PGDB="${PGDB:-hanmir_talk}"
# 업로드 루트는 compose 가 신뢰하는 단일 출처(.env.prod)에서 읽어 컨테이너 마운트와
# 항상 일치시킨다. 환경변수로 명시 override 가능.
UPLOAD_DIR_HOST="${UPLOAD_DIR_HOST:-$(env_get UPLOAD_DIR_HOST)}"
UPLOAD_DIR_HOST="${UPLOAD_DIR_HOST:-/srv/hanmir-talk/uploads}"
IMPORT_DIR="${IMPORT_DIR:-/srv/hanmir-talk/import}"
IMPORT_DIR="${IMPORT_DIR%/}"                 # 끝 슬래시 정규화 (prefix strip 안전)
# 업로더(uploaded_by) — 자료실에 "올린 사람"으로 기록됨. 기본 양현준(admin).
UPLOADER_EMAIL="${UPLOADER_EMAIL:-yanghj@hanmirfe.com}"

# 라우트(server/src/routes/files.ts)의 ALLOWED_EXTENSIONS 와 동일하게 유지.
ALLOWED_EXTS=" jpg jpeg png webp gif pdf doc docx hwp hwpx xls xlsx csv ppt pptx zip "

# 디스크 파일명 길이 상한(문자수). uuid(36)+'-' 프리픽스 37바이트 + 확장자 여유를
# 고려해 보수적으로 잡는다. 한글 3B·이모지 4B 여도 40*4+여유 < 255B.
NAME_MAX_CHARS=40

COMMIT=0
[ "${1:-}" = "--commit" ] && COMMIT=1

YYYY="$(date +%Y)"
MM="$(date +%m)"

# ───────────────────────── 헬퍼 ─────────────────────────
log()  { printf '%s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*" >&2; }
die()  { printf 'ERROR %s\n' "$*" >&2; exit 1; }

# psql -tA (tuples only, unaligned). ON_ERROR_STOP 로 첫 에러에서 중단.
# 값은 항상 --set + :'var' 로 넘겨 SQL 인젝션/따옴표 문제를 피한다.
# SQL 은 첫 인자, psql 플래그(--set 등)는 그 뒤. SQL 을 stdin 으로 먹여야
# :'var' 보간이 동작한다(psql 은 -c 에선 보간 안 함). stdin 을 명시적으로
# 파이프하므로 while-read 루프의 입력을 삼키지도 않는다.
psql_t() {
  local sql="$1"; shift
  printf '%s\n' "$sql" | docker exec -i "$DB_CONTAINER" \
    psql -U "$PGUSER" -d "$PGDB" -tA -v ON_ERROR_STOP=1 "$@"
}

# 확장자 → MIME (라우트 ALLOWED_MIME_PREFIXES 와 호환). 모르면 file(1) 로 추정.
mime_for() {
  local f="$1" ext
  ext="$(printf '%s' "${1##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    jpg|jpeg) echo "image/jpeg" ;;
    png)      echo "image/png" ;;
    webp)     echo "image/webp" ;;
    gif)      echo "image/gif" ;;
    pdf)      echo "application/pdf" ;;
    doc)      echo "application/msword" ;;
    docx)     echo "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ;;
    xls)      echo "application/vnd.ms-excel" ;;
    xlsx)     echo "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ;;
    csv)      echo "text/csv" ;;
    ppt)      echo "application/vnd.ms-powerpoint" ;;
    pptx)     echo "application/vnd.openxmlformats-officedocument.presentationml.presentation" ;;
    zip)      echo "application/zip" ;;
    hwp)      echo "application/x-hwp" ;;
    hwpx)     echo "application/haansofthwp" ;;
    *)        file --mime-type -b "$f" 2>/dev/null || echo "application/octet-stream" ;;
  esac
}

ext_allowed() {
  local ext
  ext="$(printf '%s' "${1##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ALLOWED_EXTS" in *" $ext "*) return 0 ;; *) return 1 ;; esac
}

# 디스크 파일명 안전화: 경로구분자·제어문자 제거 + 길이 상한(확장자 보존).
# 표시 이름(DB file_name)은 원본을 유지하고, 디스크 토큰 이름만 줄인다.
sanitize_diskname() {
  local raw base ext
  raw="$(printf '%s' "$1" | tr -d '\000-\037\177' | tr '/' '_')"
  [ -n "$raw" ] || raw="upload"
  ext=""; base="$raw"
  case "$raw" in *.*) ext=".${raw##*.}"; base="${raw%.*}" ;; esac
  if [ "${#base}" -gt "$NAME_MAX_CHARS" ]; then base="${base:0:$NAME_MAX_CHARS}"; fi
  printf '%s%s' "$base" "$ext"
}

# 최상위 폴더 id (이름으로, NFC 정규화 비교). 없으면 빈 문자열.
root_folder_id() {
  psql_t "SELECT id FROM file_folders
           WHERE normalize(name, NFC) = normalize(:'n', NFC) AND parent_id IS NULL
           ORDER BY created_at LIMIT 1" --set n="$1"
}

# 하위 폴더 id (이름 + 부모, NFC 비교). 없으면: commit 모드면 생성, dry-run 이면 빈 문자열.
sub_folder_id() {
  local name="$1" parent="$2" id
  id="$(psql_t "SELECT id FROM file_folders
                 WHERE normalize(name, NFC) = normalize(:'n', NFC) AND parent_id = '$parent'::uuid
                 ORDER BY created_at LIMIT 1" --set n="$name")"
  if [ -n "$id" ]; then echo "$id"; return 0; fi
  if [ "$COMMIT" -eq 1 ]; then
    id="$(psql_t "INSERT INTO file_folders(name, parent_id, created_by)
                  VALUES (normalize(:'n', NFC), '$parent'::uuid, '$UPLOADER_ID'::uuid) RETURNING id" \
          --set n="$name")"
    echo "$id"
  else
    echo ""  # dry-run: 아직 안 만듦
  fi
}

# ───────────────────────── 사전 점검 ─────────────────────────
# 동시 실행 방지 (util-linux flock 있으면).
if command -v flock >/dev/null 2>&1; then
  exec 9>"/tmp/hanmir-bulk-import.lock"
  flock -n 9 || die "다른 적재 작업이 실행 중입니다 (lock 점유). 끝난 뒤 다시 시도하세요."
fi

docker exec -i "$DB_CONTAINER" pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1 \
  || die "DB($DB_CONTAINER) 에 연결할 수 없습니다."

[ -n "$UPLOAD_DIR_HOST" ] && [ -d "$UPLOAD_DIR_HOST" ] \
  || die "업로드 루트 경로가 잘못됨(존재하지 않음): '$UPLOAD_DIR_HOST' — .env.prod 의 UPLOAD_DIR_HOST 확인."

[ -d "$IMPORT_DIR" ] || die "스테이징 폴더가 없습니다: $IMPORT_DIR (여기에 파일을 부서별로 넣으세요)"

UPLOADER_ID="$(psql_t "SELECT id FROM users WHERE email = :'e' LIMIT 1" \
  --set e="$UPLOADER_EMAIL")"
[ -n "$UPLOADER_ID" ] || die "업로더 사용자를 찾을 수 없습니다: $UPLOADER_EMAIL"

mode_label="DRY-RUN (변경 없음 — 실제 적재는 --commit)"
[ "$COMMIT" -eq 1 ] && mode_label="COMMIT (실제 적재)"
log "── 자료실 대량 적재 ─────────────────────────"
log "  모드        : $mode_label"
log "  DB          : $DB_CONTAINER / $PGDB"
log "  업로드 루트  : $UPLOAD_DIR_HOST  →  컨테이너 /data/uploads"
log "  스테이징     : $IMPORT_DIR"
log "  업로더       : $UPLOADER_EMAIL ($UPLOADER_ID)"
log "  저장 경로    : bulk/$YYYY/$MM/<uuid>-<원본이름>"
log "────────────────────────────────────────────"

# 심볼릭 링크는 -type f 에 안 잡혀 조용히 누락되므로 미리 경고.
sym_warned=0
while IFS= read -r -d '' link; do
  warn "심볼릭 링크는 적재 대상이 아닙니다(건너뜀): ${link#"$IMPORT_DIR"/}  — 실제 파일로 복사해 두세요."
  sym_warned=1
done < <(find "$IMPORT_DIR" -type l -print0 2>/dev/null)
[ "$sym_warned" -eq 1 ] && log ""

# 부서 폴더 id 캐시 (경로 → folder_id). 빈 값이면 dry-run 미생성 하위폴더.
declare -A FOLDER_ID
declare -A FOLDER_REPORTED

ok=0; skip=0; dup=0; created_files=0

# 모든 일반 파일을 NUL 구분으로 순회 (공백/한글/줄바꿈 안전).
while IFS= read -r -d '' abs; do
  relpath="${abs#"$IMPORT_DIR"/}"          # 예: 경영지원실/인사/급여대장.xlsx
  fname="$(basename -- "$abs")"            # 표시 이름 (한글/공백 유지)
  dirrel="$(dirname -- "$relpath")"        # 예: 경영지원실/인사  (없으면 ".")

  if [ "$dirrel" = "." ]; then
    warn "최상위에 바로 둔 파일은 부서 폴더가 없어 건너뜀: $relpath"
    skip=$((skip+1)); continue
  fi

  if ! ext_allowed "$fname"; then
    warn "허용되지 않은 확장자 — 건너뜀: $relpath"
    skip=$((skip+1)); continue
  fi

  # 디렉터리 경로를 '/' 기준 세그먼트로 분해 (NUL record 라 줄바꿈 안전).
  IFS='/' read -r -d '' -a segs < <(printf '%s\0' "$dirrel")

  chain_key=""; parent_id=""; folder_id=""; unresolved=0
  for i in "${!segs[@]}"; do
    seg="${segs[$i]}"
    chain_key="${chain_key}/${seg}"
    if [ -n "${FOLDER_ID[$chain_key]+x}" ] && [ -n "${FOLDER_ID[$chain_key]}" ]; then
      folder_id="${FOLDER_ID[$chain_key]}"; parent_id="$folder_id"; continue
    fi
    if [ "$i" -eq 0 ]; then
      folder_id="$(root_folder_id "$seg")"
      if [ -z "$folder_id" ]; then
        if [ -z "${FOLDER_REPORTED[$chain_key]+x}" ]; then
          warn "부서(최상위) 폴더가 없음: '$seg' — admin 이 먼저 만들어야 합니다. 이 폴더의 파일은 건너뜀."
          FOLDER_REPORTED[$chain_key]=1
        fi
        unresolved=1; break
      fi
    else
      folder_id="$(sub_folder_id "$seg" "$parent_id")"
      if [ -z "$folder_id" ]; then
        if [ -z "${FOLDER_REPORTED[$chain_key]+x}" ]; then
          log "  [폴더 생성예정] ${chain_key#/}"
          FOLDER_REPORTED[$chain_key]=1
        fi
        unresolved=1; break
      fi
    fi
    FOLDER_ID[$chain_key]="$folder_id"
    parent_id="$folder_id"
  done

  if [ "$unresolved" -eq 1 ]; then
    if [ "$COMMIT" -eq 0 ]; then
      log "  [적재예정]    $relpath"
      ok=$((ok+1))
    else
      warn "폴더 미해결로 건너뜀: $relpath"
      skip=$((skip+1))
    fi
    continue
  fi

  # 중복 검사 — 같은 폴더에 같은 이름(NFC)이 이미 있으면 건너뜀(순차 재실행 안전).
  exists="$(psql_t "SELECT 1 FROM attachments
                     WHERE folder_id = '$folder_id'::uuid
                       AND normalize(file_name, NFC) = normalize(:'fn', NFC) LIMIT 1" \
            --set fn="$fname")"
  if [ -n "$exists" ]; then
    log "  [중복skip]    $relpath"
    dup=$((dup+1)); continue
  fi

  if [ "$COMMIT" -eq 0 ]; then
    size="$(wc -c < "$abs" | tr -d ' ')"
    log "  [적재예정]    $relpath  →  folder=$folder_id  (${size}B)"
    ok=$((ok+1)); continue
  fi

  # ── 실제 적재 ──
  size="$(wc -c < "$abs" | tr -d ' ')"
  mime="$(mime_for "$abs")"
  uuid="$(cat /proc/sys/kernel/random/uuid)"
  diskname="$(sanitize_diskname "$fname")"
  rel="bulk/$YYYY/$MM/${uuid}-${diskname}"
  destdir="$UPLOAD_DIR_HOST/bulk/$YYYY/$MM"
  dest="$UPLOAD_DIR_HOST/$rel"

  mkdir -p "$destdir" || die "디렉터리 생성 실패: $destdir"
  chmod 755 "$UPLOAD_DIR_HOST/bulk" "$UPLOAD_DIR_HOST/bulk/$YYYY" "$destdir" 2>/dev/null || true
  cp -- "$abs" "$dest"     || { rm -f -- "$dest"; die "복사 실패: $relpath"; }
  chmod 644 "$dest"        || { rm -f -- "$dest"; die "권한 설정 실패: $relpath"; }

  # RETURNING id 로 실제 삽입 여부를 확인 — 0행(동시 실행 경합 등)이면 고아 파일 제거.
  inserted_id="$(psql_t "INSERT INTO attachments(file_name, file_type, file_size, file_url, uploaded_by, folder_id)
            SELECT normalize(:'fn', NFC), :'ft', ${size}, :'fu', '$UPLOADER_ID'::uuid, '$folder_id'::uuid
            WHERE NOT EXISTS (
              SELECT 1 FROM attachments
               WHERE folder_id = '$folder_id'::uuid
                 AND normalize(file_name, NFC) = normalize(:'fn', NFC))
            RETURNING id" \
        --set fn="$fname" --set ft="$mime" --set fu="$rel")" \
    || { rm -f -- "$dest"; die "DB insert 실패 — 디스크 파일 롤백함: $relpath"; }

  if [ -z "$inserted_id" ]; then
    rm -f -- "$dest"   # 경합으로 이미 존재 — 방금 복사한 고아 파일 제거
    log "  [중복skip]    $relpath"
    dup=$((dup+1)); continue
  fi

  log "  [적재완료]    $relpath  →  $rel"
  ok=$((ok+1)); created_files=$((created_files+1))
done < <(find "$IMPORT_DIR" -type f -print0 | sort -z)

log "────────────────────────────────────────────"
if [ "$COMMIT" -eq 0 ]; then
  log "DRY-RUN 요약: 적재예정 $ok · 중복skip $dup · 건너뜀 $skip"
  log "실제로 넣으려면:  bash ops/bulk-import-files.sh --commit"
else
  log "완료: 적재 $created_files · 중복skip $dup · 건너뜀 $skip"
fi
