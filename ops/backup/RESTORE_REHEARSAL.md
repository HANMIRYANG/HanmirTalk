# 한미르톡 — 백업 복원 리허설 가이드

> 본 문서는 `ops/backup/backup-prod.sh` 가 만든 백업 세트
> (`db.sql.gz` + `uploads.tar.gz` + `manifest.txt`) 를 **별도 VM 에**
> 복원해 부팅·로그인·파일 흐름이 정상인지 확인하는 절차입니다.
>
> 권장 주기: **월 1회 또는 주요 릴리스 전.** 백업이 있어도 한 번도
> 복원해 보지 않으면 백업이 아닙니다.

---

## ⚠️ 절대 원칙

- **운영 환경(hanmir-prod) 에 직접 복원하지 마세요.** 본 리허설은 항상
  별도 VM(hanmir-dev 또는 임시 restore VM) 에서 수행합니다.
- 운영 환경에 진짜 복원이 필요한 사고가 났다면 → 본 문서 마지막
  "운영 긴급 복원" 절을 따르세요 (사전 점검·downtime·새 백업 선행).

---

## 0. 준비 — 별도 복원 VM

- Ubuntu Server VM 1대 (hanmir-dev 또는 일회용 restore VM).
- Docker Engine + Compose 플러그인 설치 (docs/20 R-3 참고).
- 운영 백업 디렉터리에서 복원할 세트 1개를 **이 VM 으로 복사**:

```bash
# 예: 운영 VM(hanmir-prod) → 본인 PC → 복원 VM
# (Tailscale 사용 시 ssh / scp 가 100.x.y.z 로 그대로 동작)
scp -r admin@hanmir-prod:/srv/hanmir-talk/backups/20260526-103045 \
    ./restore-set/
scp -r ./restore-set admin@hanmir-restore:/tmp/restore-set
```

복원 세트 구성 확인:

```
20260526-103045/
├── db.sql.gz
├── uploads.tar.gz
└── manifest.txt
```

`manifest.txt` 의 `git_commit` 을 확인해 같은 commit 의 리포지토리에서
복원하는 것을 권장 (스키마 일치).

---

## 1. 복원 VM 에서 리포지토리 + .env.prod 준비

```bash
# 1) 리포지토리 clone (manifest 의 git_commit 으로 checkout 권장)
git clone <repo-url> /srv/hanmir-talk
cd /srv/hanmir-talk
git checkout <manifest 의 git_commit>     # 선택 — 스키마 mismatch 회피

# 2) .env.prod 준비
cp .env.prod.example .env.prod
$EDITOR .env.prod                          # 운영과 동일한 비밀번호로
chmod 600 .env.prod

# 3) 업로드 디렉터리 미리 생성 (복원 본 데이터가 들어갈 자리)
sudo mkdir -p /srv/hanmir-talk/uploads
sudo chown -R 1000:1000 /srv/hanmir-talk/uploads
sudo chmod 750 /srv/hanmir-talk/uploads
```

> 비밀번호가 운영과 다르면 `pg_dump` 가 만든 dump 는 무관(스키마+데이터
> 만 들어 있음)하지만, 부팅 후 로그인이 운영과 다른 비밀번호로 동작 —
> 리허설에서는 운영과 같은 값을 쓰는 게 가장 자연스럽습니다.

---

## 2. PostgreSQL 만 먼저 기동 — 빈 볼륨

```bash
# 데이터 볼륨이 비어 있어야 initdb 가 마이그 001~017 을 자동 적용.
# 이전 시도가 남아 있으면 깨끗이 지우고 시작:
docker compose -f docker-compose.prod.yml --env-file .env.prod down -v

# postgres 컨테이너만 부팅
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d postgres

# 부팅 대기 (healthy 까지 ~15s) — pg_isready 가 응답할 때까지:
until docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
        sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; do
  sleep 1
done
echo "postgres ready"
```

---

## 3. db.sql.gz 복원

```bash
cd /srv/hanmir-talk
RESTORE_SET=/tmp/restore-set/20260526-103045

gunzip -c "$RESTORE_SET/db.sql.gz" \
  | docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
      sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
```

`ON_ERROR_STOP=1` 이라 첫 에러에 즉시 중단. 끝까지 흐르면 성공.

> **2단계에서 빈 postgres 가 부팅하며 마이그 001~017 을 자동 적용해 둔
> 상태인데도 본 단계가 충돌 없이 흐르는 이유**: 백업 dump 가
> `pg_dump --clean --if-exists` 로 생성되어, 본문 맨 앞에서 기존 객체를
> `DROP ... IF EXISTS` 로 먼저 정리한 뒤 자기가 만든 스키마로 채워 넣는다.
> 따라서 빈 컨테이너 부팅 직후의 마이그 결과가 곧바로 덮어쓰여진다.

복원 후 빠른 sanity 확인:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt" \
  | head -40

# 사용자 수 / 메시지 수 등 운영과 동일한 카운트인지 비교:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM messages) AS messages,
          (SELECT count(*) FROM projects) AS projects;"
```

---

## 4. uploads.tar.gz 복원

tar 가 `uploads/` basename 째 보관하고 있으므로, 부모 디렉터리에
풀면 `UPLOAD_DIR_HOST` 와 같은 경로로 복원됩니다.

```bash
# UPLOAD_DIR_HOST=/srv/hanmir-talk/uploads 가정
sudo rm -rf /srv/hanmir-talk/uploads
sudo tar -xzf "$RESTORE_SET/uploads.tar.gz" -C /srv/hanmir-talk
sudo chown -R 1000:1000 /srv/hanmir-talk/uploads
sudo chmod 750 /srv/hanmir-talk/uploads

# 개수/총량 확인
du -sh /srv/hanmir-talk/uploads
find /srv/hanmir-talk/uploads -type f | wc -l
```

---

## 5. 전체 compose 기동

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 서버 로그에 다음 두 줄이 보이면 OK
#   [hanmir-server] repository adapter: postgres
#   [hanmir-server] listening on http://localhost:4000/api/v1
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f --tail=50 server
```

---

## 6. 스모크 검증

```bash
npm install                                # 복원 VM 에 한 번
npm run smoke:prod -- \
  --base-url=http://<복원-VM-IP-또는-Tailscale-IP> \
  --email=<운영-시드-관리자-이메일> \
  --password=<운영-비밀번호>
```

기대 결과:

```
결과: 8 PASS / 0 FAIL
```

`must_change_password` 가 강제된 계정이면 한 번 변경한 뒤 변경된
비밀번호로 다시 스모크. 운영과 동일한 시드 데이터라면 운영에서 이미
변경한 비밀번호 그대로 사용 가능.

---

## 7. 기능 단위 수동 확인

스모크가 통과해도 다음 3가지는 사람이 한 번 클릭해서 봐야 합니다:

- [ ] 로그인 후 `/chat` — 운영과 같은 채팅방 목록이 보이는가
- [ ] 임의 프로젝트 진입 — `/projects/[id]` — 진행률·멤버·업무 정상
- [ ] 파일 다운로드 1회 — `/files` 또는 채팅 첨부 → 클릭 → 바이트 손실 없는지

---

## 성공 기준 (모두 ✅ 이어야 리허설 통과)

- [ ] postgres 컨테이너 healthy
- [ ] `\dt` 출력에 테이블 25개 (마이그 001~017 기준)
- [ ] users / messages / projects 카운트가 운영과 일치
- [ ] uploads 디렉터리 파일 수·총 크기가 운영과 ±오차범위
- [ ] server 로그에 `repository adapter: postgres`
- [ ] `npm run smoke:prod` 8 PASS / 0 FAIL
- [ ] 수동 확인 3개 정상

---

## 운영 긴급 복원 (사고 발생 시)

운영에 진짜 복원이 필요한 사고가 났다면 다음을 지켜주세요.

1. **유지보수 창(maintenance window) 공지** — 최소 30분, 가능하면 1시간.
2. **app 컨테이너만 먼저 정지**:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod stop web server caddy
   ```
3. **현재 상태 한 번 더 백업** — 잘못된 데이터라도 복원 직전 스냅샷을
   남겨야 사고 분석이 가능합니다:
   ```bash
   sudo bash ./ops/backup/backup-prod.sh
   ```
   결과 디렉터리에 `.pre-restore` 마커 파일을 추가해 식별:
   ```bash
   touch /srv/hanmir-talk/backups/<신규-타임스탬프>/.pre-restore
   ```
4. **별도 VM 에서 리허설을 먼저 수행** — 이 문서 1~7 단계를 그대로.
   리허설이 100% 통과한 다음에만 운영에 적용.
5. 운영 적용:
   - `docker compose down -v` → DB 볼륨 삭제
   - `up -d postgres` → 빈 PG 부팅
   - `db.sql.gz` 복원
   - `uploads.tar.gz` 복원
   - `up -d --build` → 전체 기동
6. 스모크 + 수동 확인 후 직원에게 복구 완료 공지.

문제가 더 커지면 immediately roll forward 보다 **3번의 `.pre-restore`
백업으로 되돌리기**가 안전합니다.
