-- Migration: 031_meeting_ppt
-- 회의 파이프라인에 awaiting_ppt 단계 추가 — 전사 완료 후 부서별 주간보고
-- PPT(.pptx) 업로드를 기다렸다가 회의록(부서별 포맷) 생성에 반영한다.
-- 업로드된 PPT 파일 자체는 attachments 가 아니라 <uploadDir>/meetings/<id>/
-- 아래 서버 내부 파일로만 존재하며(자료실 미노출), 추출 텍스트·이미지 판독
-- 결과만 meeting_ppt 에 남는다.
--
-- 기존 운영 DB 적용:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 \
--     -f /docker-entrypoint-initdb.d/031_meeting_ppt.sql

BEGIN;

-- 029 의 status 컬럼 인라인 CHECK 자동 이름 = meetings_status_check
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_status_check
  CHECK (status IN ('recording','pending','transcribing','awaiting_ppt',
                    'summarizing','generating_docs','completed','failed',
                    'cancelled'));

-- awaiting_ppt 진입 시각 — MEETING_PPT_WAIT_HOURS(기본 24h) 타임아웃 기준.
-- 초과 시 워커가 PPT 없이 summarizing 으로 자동 진행한다.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ppt_requested_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS meetings_awaiting_ppt_idx
  ON meetings (ppt_requested_at) WHERE status = 'awaiting_ppt';

-- 업로드된 PPT 의 추출 텍스트 + 슬라이드 이미지 판독 캐시. 파일 자체는
-- <uploadDir>/meetings/<id>/ppt.pptx (오디오와 함께 보존기한 정리됨 —
-- 회의록 생성에 필요한 텍스트는 여기 남으므로 파일 삭제와 무관).
CREATE TABLE IF NOT EXISTS meeting_ppt (
  meeting_id UUID PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
  -- uploadDir 상대 경로 (예: "meetings/<id>/ppt.pptx")
  file_path TEXT NOT NULL,
  -- 슬라이드 XML 파서(jszip) 추출 텍스트 — 업로드 라우트에서 동기 생성
  text_content TEXT NOT NULL,
  -- 슬라이드 내 이미지(엑셀 캡처 등) Gemini 판독 결과 (best-effort)
  image_summary TEXT,
  -- pending: 미시도 / done: 성공 / failed: 실패(재시도 안 함) / none: 이미지 없음
  image_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (image_status IN ('pending','done','failed','none')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
