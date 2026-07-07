// 회의록 파이프라인 상태머신 — pending → transcribing → summarizing →
// generating_docs → completed. 워커가 클레임한 회의 하나를 받아 남은
// 스테이지를 순차 실행한다. 각 스테이지의 산출물은 DB 에 저장돼 있어
// (meeting_transcripts / meeting_minutes) 재시도·서버 재시작 시 완료분을
// 건너뛰고 재개한다. 스텝 throw 는 워커가 releaseClaim 으로 받아 다음
// tick 에 재시도한다 (stage 별 attempts 3회는 워커 책임).
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import type { Meeting, MeetingMinutesData } from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { config } from "../config";
import { realtime } from "../realtime";
import {
  getMinutesProvider,
  getTranscriptionProvider
} from "../ai/transcription";
import { segmentAbsPath } from "./storage";
import { postMeetingFileMessage } from "./post";
import {
  buildMinutesDocx,
  buildTranscriptDocx,
  formatDuration,
  formatKst,
  formatKstDate
} from "./docx";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function emitStage(
  meeting: Meeting,
  status: Meeting["status"],
  progress?: { done: number; total: number }
): void {
  realtime.emitMeetingUpdated({
    id: meeting.id,
    roomId: meeting.roomId,
    startedBy: meeting.startedBy,
    status,
    progress
  });
}

// ── transcribing ────────────────────────────────────────────────────
async function stepTranscribe(repos: Repositories, meeting: Meeting): Promise<void> {
  const provider = getTranscriptionProvider();
  if (!provider) throw new Error("transcription_provider_unavailable");

  const segments = (await repos.meetings.listSegments(meeting.id)).filter(
    (s) => s.bytes > 0
  );
  const done = new Map(
    (await repos.meetings.listSegmentTranscripts(meeting.id)).map((t) => [
      t.segIndex,
      t.content
    ])
  );
  const glossary = await repos.glossary.list();

  for (const seg of segments) {
    if (done.has(seg.segIndex)) continue;
    // 직전 세그먼트 전사의 꼬리 — 화자 라벨(화자1/화자2) 연속성 힌트.
    const prevDone = [...done.entries()]
      .filter(([idx]) => idx < seg.segIndex)
      .sort((a, b) => b[0] - a[0])[0];
    const prevTail = prevDone ? prevDone[1].slice(-600) : undefined;

    const absPath = await segmentAbsPath(seg.filePath);
    const { text } = await provider.transcribeSegment({
      absPath,
      mimeType: "audio/webm",
      glossary,
      prevTail,
      segIndex: seg.segIndex
    });
    await repos.meetings.saveSegmentTranscript(
      meeting.id,
      seg.segIndex,
      text,
      provider.name
    );
    done.set(seg.segIndex, text);
    // 세그먼트당 수 분 걸릴 수 있어 클레임을 갱신하고 진행률을 알린다.
    await repos.meetings.heartbeat(meeting.id);
    emitStage(meeting, "transcribing", { done: done.size, total: segments.length });
  }
  if (done.size === 0) throw new Error("no_transcribable_segments");
}

// ── 세그먼트 전사 병합 + 타임스탬프 오프셋 보정 ─────────────────────
// 각 세그먼트의 [MM:SS] 는 그 세그먼트 시작 기준 — 이전 세그먼트들의
// duration 누적을 더해 회의 전체 기준 [H:MM:SS]/[MM:SS] 로 재렌더한다.
export async function mergeTranscripts(
  repos: Repositories,
  meetingId: string
): Promise<string> {
  const segments = await repos.meetings.listSegments(meetingId);
  const transcripts = await repos.meetings.listSegmentTranscripts(meetingId);
  const offsetOf = new Map<number, number>();
  let acc = 0;
  for (const seg of segments) {
    offsetOf.set(seg.segIndex, acc);
    acc += seg.durationMs;
  }
  const parts: string[] = [];
  for (const t of transcripts) {
    const offsetSec = Math.round((offsetOf.get(t.segIndex) ?? 0) / 1000);
    const adjusted = t.content.replace(
      /\[(\d{1,2}):(\d{2})\]/g,
      (_m, mm: string, ss: string) => {
        const total = offsetSec + Number(mm) * 60 + Number(ss);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        return h > 0 ? `[${h}:${mmss}]` : `[${mmss}]`;
      }
    );
    parts.push(adjusted);
  }
  return parts.join("\n");
}

// ── summarizing ─────────────────────────────────────────────────────
function parseMinutesJson(text: string): MeetingMinutesData | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  try {
    const data = JSON.parse(raw) as MeetingMinutesData;
    if (
      typeof data.overview !== "string" ||
      !Array.isArray(data.attendees) ||
      !Array.isArray(data.agenda) ||
      !Array.isArray(data.decisions) ||
      !Array.isArray(data.actionItems)
    ) {
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}

async function stepSummarize(repos: Repositories, meeting: Meeting): Promise<void> {
  const provider = getMinutesProvider();
  if (!provider) throw new Error("minutes_provider_unavailable");

  const merged = await mergeTranscripts(repos, meeting.id);
  if (!merged.trim()) throw new Error("empty_transcript");

  const result = await provider.generate(merged, {
    title: meeting.title,
    date: `${formatKst(meeting.startedAt)} (KST)`,
    durationLabel: formatDuration(meeting.durationMs)
  });
  const structured = parseMinutesJson(result.text);
  if (!structured) {
    // 파싱 실패는 파이프라인 실패가 아니다 — 원문 폴백으로 DOCX 를 만든다.
    // eslint-disable-next-line no-console
    console.error(
      `[hanmir-server] meeting ${meeting.id}: minutes JSON parse failed, using raw fallback`
    );
  }
  const existing = await repos.meetings.getMinutes(meeting.id);
  await repos.meetings.saveMinutes(meeting.id, {
    contentMd: result.text,
    structured,
    docxPaths: existing?.docxPaths ?? {},
    modelUsed: provider.name
  });
}

// ── generating_docs ─────────────────────────────────────────────────
// files.ts safeFilename 과 동일한 저장 규약(<yyyy>/<mm>/<hex>-<name>)으로
// 기존 파일 첨부와 같은 위치에 저장하고, attachments 로 등록해 회의
// 시작자 명의의 파일 메시지 2건으로 게시한다.
function generatedDocxPath(fileName: string): { rel: string; abs: string; absDir: string } {
  const now = new Date();
  const subdir = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
  const token = randomBytes(8).toString("hex");
  const absDir = path.join(config.uploadDir, subdir);
  const abs = path.join(absDir, `${token}-${fileName}`);
  const rel = path.join(subdir, `${token}-${fileName}`).replace(/\\/g, "/");
  return { rel, abs, absDir };
}

function safeTitleForFilename(title: string): string {
  const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F]", "g");
  return (
    title.replace(/[\\/:*?"<>|]/g, "_").replace(CONTROL_CHARS, "").slice(0, 60) ||
    "회의"
  );
}

async function stepGenerateDocs(repos: Repositories, meeting: Meeting): Promise<void> {
  const minutes = await repos.meetings.getMinutes(meeting.id);
  if (!minutes) throw new Error("minutes_missing");
  // 재시도 가드 — docxPaths 가 이미 채워져 있으면 생성·게시가 끝난
  // 것으로 간주한다 (게시 후 커밋 순서라 최악의 경우 중복 1회 게시가
  // 유실보다 낫다는 트레이드오프).
  if (minutes.docxPaths.minutes && minutes.docxPaths.transcript) return;

  const transcriptText = await mergeTranscripts(repos, meeting.id);
  const structured = (minutes.structured as MeetingMinutesData | undefined) ?? null;
  const minutesBuf = await buildMinutesDocx(meeting, structured, minutes.contentMd);
  const transcriptBuf = await buildTranscriptDocx(meeting, transcriptText);

  const dateLabel = formatKstDate(meeting.startedAt);
  const safeTitle = safeTitleForFilename(meeting.title);
  const files: { key: "minutes" | "transcript"; name: string; buf: Buffer; body: string }[] = [
    {
      key: "minutes",
      name: `${dateLabel}_${safeTitle}_회의록.docx`,
      buf: minutesBuf,
      body: `📋 회의록 — ${meeting.title}`
    },
    {
      key: "transcript",
      name: `${dateLabel}_${safeTitle}_전사전문.docx`,
      buf: transcriptBuf,
      body: `📝 전사 전문 — ${meeting.title}`
    }
  ];

  const docxPaths: Record<string, string> = { ...minutes.docxPaths };
  for (const f of files) {
    const { rel, abs, absDir } = generatedDocxPath(f.name);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(abs, f.buf);
    let created;
    try {
      created = await repos.files.create(
        {
          fileName: f.name,
          fileSize: f.buf.length,
          fileType: DOCX_MIME,
          fileUrl: rel
        },
        meeting.startedBy
      );
    } catch (err) {
      await fs.unlink(abs).catch(() => undefined);
      throw err;
    }
    // 방이 삭제된 회의(roomId 없음)는 게시만 생략 — 산출물은 보존된다.
    if (meeting.roomId) {
      await postMeetingFileMessage(
        repos,
        meeting.roomId,
        meeting.startedBy,
        f.body,
        created.id
      );
    }
    docxPaths[f.key] = rel;
  }
  await repos.meetings.saveMinutes(meeting.id, {
    contentMd: minutes.contentMd,
    structured: minutes.structured,
    docxPaths
  });
}

// ── 실행기 ──────────────────────────────────────────────────────────
// 클레임된 회의의 남은 스테이지를 completed 까지 순차 실행. 단일 VM +
// 워커 단일 tick(running 가드) 전제라 스테이지 사이 재클레임 레이스는
// 없다. throw 는 워커가 잡아 releaseClaim 한다.
export async function runMeetingPipeline(
  repos: Repositories,
  claimed: Meeting
): Promise<void> {
  let meeting: Meeting | undefined = claimed;
  while (meeting) {
    switch (meeting.status) {
      case "pending":
        await repos.meetings.advance(meeting.id, "transcribing");
        emitStage(meeting, "transcribing");
        break;
      case "transcribing":
        await stepTranscribe(repos, meeting);
        await repos.meetings.advance(meeting.id, "summarizing");
        emitStage(meeting, "summarizing");
        break;
      case "summarizing":
        await stepSummarize(repos, meeting);
        await repos.meetings.advance(meeting.id, "generating_docs");
        emitStage(meeting, "generating_docs");
        break;
      case "generating_docs":
        await stepGenerateDocs(repos, meeting);
        await repos.meetings.advance(meeting.id, "completed");
        emitStage(meeting, "completed");
        return;
      default:
        return; // completed/failed/cancelled/recording — 손대지 않음
    }
    meeting = await repos.meetings.findById(meeting.id);
  }
}
