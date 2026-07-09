// 회의 AI 프로바이더 팩토리 — 전사(Gemini)와 회의록(Claude) 호출부를
// 인터페이스 뒤로 추상화해 MEETING_AI_MOCK=true 면 목으로 대체된다.
// 파이프라인/라우트는 이 모듈만 알고, 실제 SDK 는 gemini.ts/anthropic.ts
// 에만 산다.
import type { GlossaryTerm } from "@hanmir/shared";
import { config } from "../config";
import {
  MockPptImageReader,
  MockTranscriptionProvider,
  mockGenerateMinutes
} from "./mock";
import { GeminiPptImageReader, GeminiTranscriptionProvider } from "./gemini";
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
    opts: {
      title: string;
      date: string;
      durationLabel: string;
      // 부서별 주간보고 PPT 추출 텍스트 (파서 + 이미지 판독 합본).
      // 없으면 전사만으로 부서를 추론한다.
      pptText?: string;
    }
  ): Promise<{ text: string }>;
}

// PPT 슬라이드에 붙은 이미지(엑셀 캡처 등)에서 텍스트를 읽는 보조
// 프로바이더 — stepSummarize 의 best-effort 경로 전용.
export interface PptImageReader {
  readonly name: string;
  readImages(
    images: { data: Buffer; mimeType: string; label: string }[]
  ): Promise<{ text: string }>;
}

let transcription: TranscriptionProvider | null | undefined;
let minutes: MinutesProvider | null | undefined;
let pptImageReader: PptImageReader | null | undefined;

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
      generate: async (_transcript, opts) => {
        const r = await mockGenerateMinutes(opts.pptText);
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

export function getPptImageReader(): PptImageReader | null {
  if (pptImageReader !== undefined) return pptImageReader;
  if (config.meetingAiMock) pptImageReader = new MockPptImageReader();
  else if (config.geminiApiKey) pptImageReader = new GeminiPptImageReader();
  else pptImageReader = null;
  return pptImageReader;
}

// 회의 시작 게이트 — 전사와 회의록 둘 다 가능해야 시작을 허용한다.
// 중간 단계에서만 실패할 죽은 녹음을 만들지 않기 위해.
export function isMeetingAiEnabled(): boolean {
  if (config.meetingAiMock) return true;
  return Boolean(config.geminiApiKey) && isAiEnabled();
}
