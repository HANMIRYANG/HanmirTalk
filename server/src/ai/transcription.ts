// 회의 AI 프로바이더 팩토리 — 전사(Gemini)와 회의록(Claude) 호출부를
// 인터페이스 뒤로 추상화해 MEETING_AI_MOCK=true 면 목으로 대체된다.
// 파이프라인/라우트는 이 모듈만 알고, 실제 SDK 는 gemini.ts/anthropic.ts
// 에만 산다.
import type { GlossaryTerm } from "@hanmir/shared";
import { config } from "../config";
import { MockTranscriptionProvider, mockGenerateMinutes } from "./mock";
import { GeminiTranscriptionProvider } from "./gemini";
import { generateMeetingMinutes, isAiEnabled } from "./anthropic";

export interface TranscribeSegmentInput {
  // 디스크 절대 경로 (라우트/파이프라인이 resolveMeetingPath 로 검증해 전달)
  absPath: string;
  mimeType: string;
  glossary: GlossaryTerm[];
  // 직전 세그먼트 전사의 꼬리 (~600자) — 화자 라벨 연속성 힌트
  prevTail?: string;
  segIndex: number;
}

export interface TranscriptionProvider {
  // meeting_transcripts.model_used 에 기록되는 라벨
  readonly name: string;
  transcribeSegment(input: TranscribeSegmentInput): Promise<{ text: string }>;
}

export interface MinutesProvider {
  readonly name: string;
  generate(
    transcript: string,
    opts: { title: string; date: string; durationLabel: string }
  ): Promise<{ text: string }>;
}

let transcription: TranscriptionProvider | null | undefined;
let minutes: MinutesProvider | null | undefined;

export function getTranscriptionProvider(): TranscriptionProvider | null {
  if (transcription !== undefined) return transcription;
  if (config.meetingAiMock) transcription = new MockTranscriptionProvider();
  else if (config.geminiApiKey) transcription = new GeminiTranscriptionProvider();
  else transcription = null;
  return transcription;
}

export function getMinutesProvider(): MinutesProvider | null {
  if (minutes !== undefined) return minutes;
  if (config.meetingAiMock) {
    minutes = {
      name: "mock-minutes",
      generate: async () => {
        const r = await mockGenerateMinutes();
        return { text: r.text };
      }
    };
  } else if (isAiEnabled()) {
    minutes = {
      name: config.anthropicModel,
      generate: async (transcript, opts) => {
        const r = await generateMeetingMinutes(transcript, opts);
        return { text: r.text };
      }
    };
  } else {
    minutes = null;
  }
  return minutes;
}

// 회의 시작 게이트 — 전사와 회의록 둘 다 가능해야 시작을 허용한다.
// 중간 단계에서만 실패할 죽은 녹음을 만들지 않기 위해.
export function isMeetingAiEnabled(): boolean {
  if (config.meetingAiMock) return true;
  return Boolean(config.geminiApiKey) && isAiEnabled();
}
