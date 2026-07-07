-- Migration: 029_meetings
-- 회의 녹음 → Gemini 전사 → Claude 회의록 → DOCX 게시 파이프라인.
--
-- meetings.room_id 는 의도적으로 nullable — 회의가 채팅방에 종속되지 않게
-- 설계해 추후 회의 목록 탭 / 독립 전사 앱으로 마이그레이션 없이 확장한다.
-- 오디오는 attachments 가 아니라 <uploadDir>/meetings/<id>/ 아래 서버 내부
-- 파일로만 존재한다 (자료실에 노출되지 않음). 산출물 DOCX 2건만 attachments
-- 로 들어가 채팅방에 게시된다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/029_meetings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  started_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  -- recording: 브라우저가 청크 업로드 중
  -- pending → transcribing → summarizing → generating_docs: 워커 파이프라인
  -- completed / failed / cancelled: 종결
  status TEXT NOT NULL DEFAULT 'recording'
    CHECK (status IN ('recording','pending','transcribing','summarizing',
                      'generating_docs','completed','failed','cancelled')),
  -- uploadDir 상대 디렉터리 (예: "meetings/<id>"). 보존기한 삭제 후 NULL.
  audio_path TEXT,
  audio_retention_until TIMESTAMP,
  -- 클라이언트가 보고한 청크 duration 누적 (근사치, 최대시간 컷 판단용)
  duration_ms BIGINT NOT NULL DEFAULT 0,
  -- 마지막 청크 수신 시각 — 좀비 녹음(탭 강제 종료) auto-finish 판단
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- 현재 stage 시도 횟수. stage 전이 시 0으로 리셋 → stage별 3회 재시도
  attempts INT NOT NULL DEFAULT 0,
  -- 워커 클레임 + 하트비트. stale(15분)이면 재클레임 (서버 재시작 복구)
  claimed_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 방당 활성 녹음 1개 강제 — 동시 시작 레이스를 DB 레벨에서 차단 (23505)
CREATE UNIQUE INDEX IF NOT EXISTS meetings_active_per_room_idx
  ON meetings (room_id) WHERE status = 'recording';
CREATE INDEX IF NOT EXISTS meetings_worker_idx
  ON meetings (created_at)
  WHERE status IN ('pending','transcribing','summarizing','generating_docs');
CREATE INDEX IF NOT EXISTS meetings_retention_idx
  ON meetings (audio_retention_until) WHERE audio_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS meetings_room_idx ON meetings (room_id);

-- 녹음 세그먼트 = 독립 WebM 스트림 1개. 같은 MediaRecorder 세션의 timeslice
-- 청크는 seq 순 byte-append 로 이어붙일 수 있지만, 새로고침/재개 후의 새
-- MediaRecorder 는 새 컨테이너 헤더를 가지므로 별도 세그먼트 파일이 된다.
-- 60분 로테이션(전사 출력 토큰 한계 방어)도 새 세그먼트를 만든다.
CREATE TABLE IF NOT EXISTS meeting_segments (
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seg_index INT NOT NULL,
  -- uploadDir 상대 경로 (예: "meetings/<id>/seg-000.webm")
  file_path TEXT NOT NULL,
  bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  -- 마지막으로 append 된 청크 seq. dup(seq<=last_seq)/gap(seq>last_seq+1) 검출
  last_seq INT NOT NULL DEFAULT -1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, seg_index)
);

-- 세그먼트 단위 전사 결과. 파이프라인 재시도/서버 재시작 시 완료된
-- 세그먼트는 건너뛰는 재개 지점이 된다. content 는 오프셋 보정 전
-- (세그먼트 시작 기준 [MM:SS]) 원문.
CREATE TABLE IF NOT EXISTS meeting_transcripts (
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seg_index INT NOT NULL,
  content TEXT NOT NULL,
  model_used TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meeting_id, seg_index)
);

CREATE TABLE IF NOT EXISTS meeting_minutes (
  meeting_id UUID PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  -- Claude 출력 원문 (fenced JSON 포함 가능)
  content_md TEXT NOT NULL,
  -- content_md 파싱 성공 시 MeetingMinutesData 형태. 실패 시 NULL (DOCX 는
  -- 원문 폴백 렌더 — 파싱 실패가 파이프라인 실패가 되지 않게)
  structured JSONB,
  model_used TEXT,
  -- {"minutes": "<yyyy>/<mm>/<hex>-....docx", "transcript": "..."} —
  -- 게시 완료 마커를 겸한다 (재시도 시 중복 게시 방지 가드)
  docx_paths JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 전사 프롬프트에 주입되는 사내 용어집 (회사명/부서명/시스템명/인명 등).
-- 관리 UI 는 추후 — 지금은 시드 + psql 로 관리.
CREATE TABLE IF NOT EXISTS glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO glossary (term, note) VALUES
  ('한미르', '회사명 (영문 표기 Hanmir)'),
  ('한미르톡', '사내 협업툴 서비스명 (HanmirTalk)'),
  ('한미르ERP', '사내 ERP 포털 (HanmirERP)'),
  ('MES', '생산관리시스템 (Manufacturing Execution System)'),
  ('불출', '창고에서 자재를 꺼내 생산에 투입하는 것')
ON CONFLICT (term) DO NOTHING;

COMMIT;
