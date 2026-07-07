// 회의 녹음 API — 시작/세그먼트/청크/종료/취소/조회.
//
// 계약 요약 (프론트 MeetingRecorderProvider 와 합의된 것):
//   POST   /meetings                 {roomId, title?} → 201 Meeting
//   POST   /meetings/:id/segments    → 201 {segIndex}   (새로고침 재개/로테이션)
//   POST   /meetings/:id/chunks      multipart chunk + segIndex/seq/durationMs
//                                    → 200 {ok, segIndex, receivedSeq,
//                                           totalDurationMs, rotateSuggested}
//   POST   /meetings/:id/finish      → 202 Meeting (멱등)
//   POST   /meetings/:id/cancel      → 200 {ok}
//   GET    /meetings/active?roomId=  → 200 Meeting | null
//   GET    /meetings/:id             → 200 Meeting
//   GET    /meetings?roomId=&limit=  → 200 Meeting[]
//
// 권한: 모든 라우트는 회의가 속한 방의 멤버 or admin (ai.ts 의
// ensureMemberOrAdmin 미러 — 비멤버에겐 404 로 존재 은닉). 청크 업로드는
// 녹음 중인 브라우저 = 시작자 본인만.
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { Meeting, Room } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { auditLog } from "../audit";
import { config } from "../config";
import { realtime } from "../realtime";
import { isMeetingAiEnabled } from "../ai/transcription";
import {
  appendChunk,
  deleteMeetingAudio,
  truncateSegment
} from "../meetings/storage";
import { postMeetingSystemMessage } from "../meetings/post";
import { finalizeRecording } from "../meetings/finish";

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// MediaRecorder timeslice 청크 전용 — 확장자 검사 대신 MIME 만 본다
// (Blob 파일명은 클라이언트가 합성한 "chunk-N-M.webm" 고정이라 files.ts
// 의 확장자 정책과 무관). audio/webm;codecs=opus 가 표준 경로.
const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.meetingChunkMaxBytes },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype ?? "").toLowerCase();
    const ok =
      mime === "" ||
      mime.startsWith("audio/webm") ||
      mime.startsWith("video/webm") ||
      mime === "application/octet-stream";
    if (!ok) {
      cb(new Error("unsupported_mime"));
      return;
    }
    cb(null, true);
  }
});

function chunkUploadErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) {
  if (!err) return next();
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "unsupported_mime") {
    res.status(415).json({ error: "unsupported_mime" });
    return;
  }
  if (msg.toLowerCase().includes("file too large")) {
    res.status(413).json({ error: "chunk_too_large" });
    return;
  }
  next(err);
}

function nonNegativeInt(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

export function createMeetingsRouter(repos: Repositories): Router {
  const router = Router();

  // ai.ts ensureMemberOrAdmin 미러 — 접근 가능하면 room 을 돌려줘 재조회를
  // 아낀다 (rooms.ts ensureRoomAccess 와 같은 취지).
  async function ensureRoomMember(
    req: Request,
    res: Response,
    roomId: string
  ): Promise<Room | undefined> {
    const me = req.currentUser!;
    const room = await repos.rooms.findById(roomId, me.id);
    if (!room) {
      res.status(404).json({ error: "not_found" });
      return undefined;
    }
    if (isAdminRole(me.role)) return room;
    if (!room.members.some((m) => m.userId === me.id)) {
      res.status(404).json({ error: "not_found" });
      return undefined;
    }
    return room;
  }

  // 회의 로드 + 방 멤버십 게이트. 방이 삭제된 회의(roomId 없음)는 시작자
  // 또는 admin 만 접근.
  async function loadAccessibleMeeting(
    req: Request,
    res: Response,
    meetingId: string
  ): Promise<Meeting | undefined> {
    const me = req.currentUser!;
    const meeting = await repos.meetings.findById(meetingId);
    if (!meeting) {
      res.status(404).json({ error: "not_found" });
      return undefined;
    }
    if (!meeting.roomId) {
      if (meeting.startedBy === me.id || isAdminRole(me.role)) return meeting;
      res.status(404).json({ error: "not_found" });
      return undefined;
    }
    const room = await ensureRoomMember(req, res, meeting.roomId);
    return room ? meeting : undefined;
  }

  function requireStarterOrAdmin(
    req: Request,
    res: Response,
    meeting: Meeting
  ): boolean {
    const me = req.currentUser!;
    if (meeting.startedBy === me.id || isAdminRole(me.role)) return true;
    res.status(403).json({ error: "not_starter" });
    return false;
  }

  // ── 회의 시작 ──
  router.post("/", async (req, res) => {
    const me = req.currentUser!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isString(body.roomId)) {
      res.status(400).json({ error: "roomId_required" });
      return;
    }
    const room = await ensureRoomMember(req, res, body.roomId);
    if (!room) return;
    // 전사/회의록 프로바이더가 없으면 시작 자체를 막는다 — 파이프라인
    // 중간에서만 실패할 죽은 녹음 방지.
    if (!isMeetingAiEnabled()) {
      res.status(503).json({ error: "meeting_ai_disabled" });
      return;
    }
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 150)
        : `${room.name} 회의`;

    let created: Meeting;
    try {
      created = await repos.meetings.create({
        roomId: room.id,
        title,
        startedBy: me.id
      });
    } catch (err) {
      // 방당 활성 녹음 1개 — partial unique index (23505). 동시 시작 레이스
      // 의 패자는 409 로 정리된다.
      if ((err as { code?: string }).code === "23505") {
        res.status(409).json({ error: "meeting_already_active" });
        return;
      }
      throw err;
    }
    await repos.meetings.createSegment(created.id);
    const meeting = (await repos.meetings.findById(created.id))!;

    await postMeetingSystemMessage(
      repos,
      room.id,
      me.id,
      `🔴 ${me.name}님이 회의 녹음을 시작했습니다. 이 회의는 녹음·전사됩니다.`
    );
    realtime.emitMeetingStarted(room.id, meeting);
    await auditLog(repos, req, {
      action: "meeting.start",
      targetType: "meeting",
      targetId: meeting.id,
      targetLabel: meeting.title,
      meta: { roomId: room.id }
    });
    res.status(201).json(meeting);
  });

  // ── 새 세그먼트 (새로고침 재개 / 60분 로테이션) ──
  router.post("/:id/segments", async (req, res) => {
    const meeting = await loadAccessibleMeeting(req, res, req.params.id);
    if (!meeting) return;
    if (!requireStarterOrAdmin(req, res, meeting)) return;
    if (meeting.status !== "recording") {
      res.status(409).json({ error: "not_recording" });
      return;
    }
    const { segIndex } = await repos.meetings.createSegment(meeting.id);
    res.status(201).json({ segIndex });
  });

  // ── 청크 업로드 ──
  router.post(
    "/:id/chunks",
    chunkUpload.single("chunk"),
    chunkUploadErrorHandler,
    async (req: Request, res: Response) => {
      const file = req.file;
      if (!file || file.size === 0) {
        res.status(400).json({ error: "chunk_required" });
        return;
      }
      const meeting = await loadAccessibleMeeting(req, res, req.params.id);
      if (!meeting) return;
      // 청크는 녹음 중인 브라우저에서만 온다 — 시작자 본인 한정.
      if (meeting.startedBy !== req.currentUser!.id) {
        res.status(403).json({ error: "not_starter" });
        return;
      }
      if (meeting.status !== "recording") {
        res.status(409).json({ error: "not_recording" });
        return;
      }
      const segIndex = nonNegativeInt(req.body?.segIndex);
      const seq = nonNegativeInt(req.body?.seq);
      const durationMs = nonNegativeInt(req.body?.durationMs);
      // timeslice 5분 기준 — 20분을 넘는 duration 보고는 조작/버그로 간주.
      if (
        segIndex === undefined ||
        seq === undefined ||
        durationMs === undefined ||
        durationMs > 20 * 60 * 1000
      ) {
        res.status(400).json({ error: "invalid_chunk_meta" });
        return;
      }

      const segments = await repos.meetings.listSegments(meeting.id);
      const seg = segments.find((s) => s.segIndex === segIndex);
      if (!seg) {
        res.status(404).json({ error: "segment_not_found" });
        return;
      }
      // dup/gap 은 디스크에 쓰기 전에 거른다 — 중복 append 는 WebM 을
      // 손상시키므로 응답 유실 후 재전송은 여기서 멱등 처리된다.
      if (seq <= seg.lastSeq) {
        res.json({
          ok: true,
          duplicate: true,
          segIndex,
          receivedSeq: seq,
          totalDurationMs: meeting.durationMs,
          rotateSuggested: false
        });
        return;
      }
      if (seq > seg.lastSeq + 1) {
        // 청크 유실 — 세그먼트 중간의 구멍은 복구 불가. 프론트는 recorder
        // 를 재시작해 새 세그먼트(새 WebM 헤더)로 이어간다.
        res.status(409).json({ error: "chunk_gap", expectedSeq: seg.lastSeq + 1 });
        return;
      }
      const segMaxMs = config.meetingSegmentMaxMinutes * 60 * 1000;
      if (seg.durationMs + durationMs > segMaxMs + 5 * 60 * 1000) {
        // rotateSuggested 를 무시하고 계속 밀어넣는 클라이언트 방어 —
        // 세그먼트가 전사 출력 토큰 한계를 넘기 전에 강제 차단.
        res.status(409).json({ error: "segment_too_long" });
        return;
      }

      await appendChunk(seg.filePath, file.buffer);
      const result = await repos.meetings.recordChunk(meeting.id, segIndex, {
        seq,
        bytes: file.size,
        durationMs
      });
      if (result !== "ok") {
        // 순차 업로드 전제에서 도달 불가한 레이스 — 디스크를 DB 관점
        // 크기로 되돌리고 상태에 맞는 응답을 준다.
        await truncateSegment(seg.filePath, seg.bytes);
        if (result === "duplicate") {
          res.json({
            ok: true,
            duplicate: true,
            segIndex,
            receivedSeq: seq,
            totalDurationMs: meeting.durationMs,
            rotateSuggested: false
          });
          return;
        }
        res
          .status(result === "gap" ? 409 : 404)
          .json({ error: result === "gap" ? "chunk_gap" : "segment_not_found" });
        return;
      }

      const totalDurationMs = meeting.durationMs + durationMs;
      const maxMs = config.meetingMaxHours * 60 * 60 * 1000;
      if (totalDurationMs >= maxMs) {
        // 최대 녹음 시간 도달 — 이 청크까지는 보존하고 서버가 자동 종료.
        // 클라이언트는 413 을 받으면 finish 호출 없이 recorder 만 정리한다.
        await finishMeeting(
          req,
          meeting,
          `⏱️ 최대 녹음 시간(${config.meetingMaxHours}시간)에 도달하여 회의가 자동 종료되었습니다. 회의록 생성 중...`
        );
        res.status(413).json({ error: "meeting_too_long" });
        return;
      }

      res.json({
        ok: true,
        segIndex,
        receivedSeq: seq,
        totalDurationMs,
        rotateSuggested:
          seg.durationMs + durationMs > segMaxMs - 5 * 60 * 1000
      });
    }
  );

  // finish 공통 경로 — 실제 종결은 meetings/finish.ts 의 finalizeRecording
  // (워커의 좀비 auto-finish 와 공유), 라우트는 audit 만 얹는다.
  async function finishMeeting(
    req: Request,
    meeting: Meeting,
    systemMessage: string
  ): Promise<Meeting | undefined> {
    const finished = await finalizeRecording(repos, meeting, systemMessage);
    if (!finished) return undefined; // 이미 종료됨 (멱등 경로)
    await auditLog(repos, req, {
      action: "meeting.finish",
      targetType: "meeting",
      targetId: meeting.id,
      targetLabel: meeting.title,
      meta: { durationMs: meeting.durationMs }
    });
    return finished;
  }

  // ── 회의 종료 → 파이프라인 시작 ──
  router.post("/:id/finish", async (req, res) => {
    const meeting = await loadAccessibleMeeting(req, res, req.params.id);
    if (!meeting) return;
    if (!requireStarterOrAdmin(req, res, meeting)) return;
    if (meeting.status !== "recording") {
      // 멱등 — 새로고침/재시도로 인한 중복 finish 는 현재 상태 그대로 202.
      res.status(202).json(meeting);
      return;
    }
    const finished = await finishMeeting(
      req,
      meeting,
      "회의 녹음이 종료되었습니다. 회의록 생성 중..."
    );
    res.status(202).json(finished ?? meeting);
  });

  // ── 녹음 취소 (파이프라인 없이 폐기) ──
  router.post("/:id/cancel", async (req, res) => {
    const meeting = await loadAccessibleMeeting(req, res, req.params.id);
    if (!meeting) return;
    if (!requireStarterOrAdmin(req, res, meeting)) return;
    const ok = await repos.meetings.cancel(meeting.id);
    if (!ok) {
      res.status(409).json({ error: "not_recording" });
      return;
    }
    await deleteMeetingAudio(meeting.id);
    await repos.meetings.clearAudioPath(meeting.id);
    if (meeting.roomId) {
      await postMeetingSystemMessage(
        repos,
        meeting.roomId,
        meeting.startedBy,
        "회의 녹음이 취소되었습니다."
      );
    }
    realtime.emitMeetingUpdated({
      id: meeting.id,
      roomId: meeting.roomId,
      startedBy: meeting.startedBy,
      status: "cancelled"
    });
    await auditLog(repos, req, {
      action: "meeting.cancel",
      targetType: "meeting",
      targetId: meeting.id,
      targetLabel: meeting.title,
      level: "warn"
    });
    res.json({ ok: true });
  });

  // ── 방의 활성 회의 (새로고침 복원 + 처리중 배지) ──
  // "/:id" 보다 먼저 선언해야 "active" 가 id 로 매칭되지 않는다.
  router.get("/active", async (req, res) => {
    if (!isString(req.query.roomId)) {
      res.status(400).json({ error: "roomId_required" });
      return;
    }
    const room = await ensureRoomMember(req, res, req.query.roomId);
    if (!room) return;
    const meeting = await repos.meetings.findActiveByRoom(room.id);
    res.json(meeting ?? null);
  });

  // ── 회의 목록 (추후 회의 탭 대비) ──
  router.get("/", async (req, res) => {
    if (!isString(req.query.roomId)) {
      res.status(400).json({ error: "roomId_required" });
      return;
    }
    const room = await ensureRoomMember(req, res, req.query.roomId);
    if (!room) return;
    const limit = nonNegativeInt(req.query.limit);
    const meetings = await repos.meetings.list({ roomId: room.id, limit });
    res.json(meetings);
  });

  // ── 단건 조회 (소켓 단절 시 상태 폴링 폴백) ──
  router.get("/:id", async (req, res) => {
    const meeting = await loadAccessibleMeeting(req, res, req.params.id);
    if (!meeting) return;
    res.json(meeting);
  });

  return router;
}
