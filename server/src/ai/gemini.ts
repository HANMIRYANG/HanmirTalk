// Gemini 전사 프로바이더 — @google/genai 공식 SDK. 요구사항에 따라 파일
// 크기와 무관하게 항상 Files API 참조 방식을 쓴다 (인라인 base64 금지,
// 코드 경로 단일화). Gemini 업로드 파일은 48시간 후 자동 만료되지만
// 업로드 직후 사용하고 finally 에서 즉시 삭제한다.
//
// 토큰 산정: Gemini 오디오 ≈ 32토큰/초 → 60분 세그먼트 ≈ 115K 입력 토큰
// (gemini-2.5-flash 1M 컨텍스트 내). 병목은 출력 65K 토큰 한계 — 한국어
// 60분 verbatim ≈ 2~4만 토큰으로 안전하며, 세그먼트 60분 상한(라우트의
// rotateSuggested/segment_too_long)이 이 한계의 방어선이다.
import {
  FileState,
  FinishReason,
  GoogleGenAI,
  createPartFromUri,
  createUserContent
} from "@google/genai";
import type { GlossaryTerm } from "@hanmir/shared";
import { config } from "../config";
import type {
  PptImageReader,
  TranscribeSegmentInput,
  TranscriptionProvider
} from "./transcription";

function buildPrompt(glossary: GlossaryTerm[], prevTail?: string): string {
  const lines: string[] = [
    "이 오디오는 한국 제조회사의 사내 회의 녹음입니다. 다음 규칙으로 전사하세요:",
    "1. 발화를 축약·요약하지 말고 전문(verbatim) 그대로 전사합니다.",
    "2. 화자를 구분해 '화자1', '화자2' 형식의 라벨을 붙입니다.",
    "3. 각 발화 앞에 이 오디오 파일 시작 기준 [MM:SS] 타임스탬프를 붙입니다.",
    "4. 출력 형식: 한 줄에 '[MM:SS] 화자N: 발화 내용'. 머리말·해설·요약 없이 전사 텍스트만 출력합니다."
  ];
  if (glossary.length > 0) {
    const terms = glossary.map((g) => (g.note ? `${g.term}(${g.note})` : g.term)).join(", ");
    lines.push(`5. 다음 사내 고유명사는 정확히 이 표기로 전사하세요: ${terms}`);
  }
  if (prevTail) {
    lines.push(
      "6. 이 오디오는 같은 회의의 이어지는 구간입니다. 직전 구간의 마지막 대화는 아래와 같습니다. " +
        "화자 라벨(화자1/화자2 등)을 직전 구간과 일관되게 유지하세요:\n---\n" +
        prevTail +
        "\n---"
    );
  }
  return lines.join("\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiTranscriptionProvider implements TranscriptionProvider {
  readonly name = config.geminiModel;

  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!config.geminiApiKey) throw new Error("gemini_api_key_missing");
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    return this.client;
  }

  async transcribeSegment(input: TranscribeSegmentInput): Promise<{ text: string }> {
    const ai = this.getClient();
    const uploaded = await ai.files.upload({
      file: input.absPath,
      config: { mimeType: input.mimeType }
    });
    try {
      // 업로드 직후엔 PROCESSING 일 수 있다 — ACTIVE 까지 폴링 (최대 5분).
      let file = uploaded;
      const deadline = Date.now() + 5 * 60 * 1000;
      while (file.state === FileState.PROCESSING) {
        if (Date.now() > deadline) throw new Error("gemini_file_processing_timeout");
        await delay(2000);
        file = await ai.files.get({ name: file.name! });
      }
      if (file.state === FileState.FAILED) throw new Error("gemini_file_processing_failed");

      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: createUserContent([
          createPartFromUri(file.uri!, file.mimeType ?? input.mimeType),
          buildPrompt(input.glossary, input.prevTail)
        ]),
        config: {
          temperature: 0,
          maxOutputTokens: 65536
        }
      });

      // 출력 토큰 한계로 잘린 전사는 불완전 — throw 해서 재시도로 보낸다
      // (세그먼트 60분 상한이 지켜지는 한 도달하지 않아야 정상).
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === FinishReason.MAX_TOKENS) {
        throw new Error("gemini_transcript_truncated");
      }
      const text = (response.text ?? "").trim();
      if (!text) throw new Error("gemini_empty_transcript");
      return { text };
    } finally {
      if (uploaded.name) {
        await ai.files.delete({ name: uploaded.name }).catch(() => undefined);
      }
    }
  }
}

// ── PPT 슬라이드 이미지 판독 ─────────────────────────────────────────
//
// 부서별 주간보고 PPT 에 그림으로 붙여넣은 내용(엑셀 표 캡처, 차트 등)을
// 텍스트로 복원한다. 파이프라인 stepSummarize 의 best-effort 경로 전용 —
// 여기서 throw 가 나도 호출부가 잡아서 파서 텍스트만으로 진행한다.
// 전사와 같은 Files API 참조 방식 사용 (인라인 base64 금지 규약 유지);
// 메모리 버퍼라 Blob 으로 업로드한다.
export class GeminiPptImageReader implements PptImageReader {
  readonly name = config.geminiModel;

  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!config.geminiApiKey) throw new Error("gemini_api_key_missing");
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
    return this.client;
  }

  async readImages(
    images: { data: Buffer; mimeType: string; label: string }[]
  ): Promise<{ text: string }> {
    const ai = this.getClient();
    const uploadedNames: string[] = [];
    try {
      const parts: ReturnType<typeof createPartFromUri>[] = [];
      for (const img of images) {
        let file = await ai.files.upload({
          file: new Blob([new Uint8Array(img.data)], { type: img.mimeType }),
          config: { mimeType: img.mimeType }
        });
        if (file.name) uploadedNames.push(file.name);
        const deadline = Date.now() + 2 * 60 * 1000;
        while (file.state === FileState.PROCESSING) {
          if (Date.now() > deadline) throw new Error("gemini_file_processing_timeout");
          await delay(2000);
          file = await ai.files.get({ name: file.name! });
        }
        if (file.state === FileState.FAILED) {
          throw new Error("gemini_file_processing_failed");
        }
        parts.push(createPartFromUri(file.uri!, file.mimeType ?? img.mimeType));
      }

      const labels = images.map((img, i) => `이미지 ${i + 1}: ${img.label}`).join(", ");
      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: createUserContent([
          ...parts,
          "다음 이미지들은 한국 제조회사 주간회의의 부서별 보고 PPT 슬라이드에 " +
            "포함된 캡처 이미지입니다 (엑셀 표, 차트 등). 순서대로: " +
            labels +
            ". 각 이미지에서 읽을 수 있는 텍스트와 표 내용을 " +
            "'[이미지 N (슬라이드 M)]' 제목 아래 정리하세요. 표는 셀을 ' | ' 로 " +
            "구분해 행 단위로 적으세요. 읽을 수 없는 이미지는 건너뛰고, " +
            "해설 없이 내용만 출력하세요.",
        ]),
        config: {
          temperature: 0,
          maxOutputTokens: 16384
        }
      });
      return { text: (response.text ?? "").trim() };
    } finally {
      for (const name of uploadedNames) {
        await ai.files.delete({ name }).catch(() => undefined);
      }
    }
  }
}
