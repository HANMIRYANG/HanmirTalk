import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "@hanmir/shared";
import { config } from "../config";

// Phase 5 H-4 — Anthropic Claude wrapper. All commands operate on a
// chat-message window passed by the caller (so callers control what
// goes into the model). The wrapper never persists anything; the route
// layer is responsible for storing the result back as a message if the
// user confirms.
//
// Each function returns plain text. The model is asked to reply in
// Korean. For JSON-shaped outputs (extract-tasks, extract-decisions)
// we prompt the model to emit fenced JSON and parse it server-side.

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropicApiKey) return null;
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export function isAiEnabled(): boolean {
  return Boolean(config.anthropicApiKey);
}

// Convert a list of ChatMessages into a single transcript that the
// model can read. Includes author name + role so it can attribute
// quotes correctly. Soft-deleted messages are excluded by the caller.
function transcript(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const who = m.authorName + (m.authorRole ? ` (${m.authorRole})` : "");
      const stamp = m.createdAt?.slice(0, 16) ?? "";
      return `[${stamp}] ${who}: ${m.body}`;
    })
    .join("\n");
}

const SYSTEM_PROMPT_BASE =
  "당신은 한국 제조회사의 사내 업무 채팅에서 발췌된 대화를 처리하는 비서입니다. " +
  "모든 응답은 한국어로 작성하세요. 정중하고 간결한 문체를 사용하세요.";

interface AiResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

async function complete(systemPrompt: string, userPrompt: string): Promise<AiResult> {
  const c = getClient();
  if (!c) throw new Error("ai_disabled");
  const response = await c.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }]
  });
  // The SDK returns content[] of mixed blocks. Concatenate text blocks.
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    }
  };
}

export async function summarize(messages: ChatMessage[]): Promise<AiResult> {
  return complete(
    SYSTEM_PROMPT_BASE,
    `다음 대화를 핵심만 5줄 이내로 한국어 요약하세요. 누가 무엇을 말했는지 명시:\n\n${transcript(messages)}`
  );
}

// Returns a stringified JSON array of task drafts. Caller parses to
// preview the items before letting the user confirm-and-insert.
export async function extractTasks(messages: ChatMessage[]): Promise<AiResult> {
  return complete(
    SYSTEM_PROMPT_BASE +
      ' JSON으로 답변하세요. 형식: [{"title":"...","assignee":"...","dueLabel":"...","priority":"top|high|normal|low"}]. ' +
      "다른 텍스트 없이 JSON 배열만 출력하세요.",
    `다음 대화에서 행동으로 옮겨야 할 업무를 추출해 JSON 배열로 만드세요. 명확하지 않으면 "미정"으로 채우세요.\n\n${transcript(messages)}`
  );
}

export async function extractDecisions(messages: ChatMessage[]): Promise<AiResult> {
  return complete(
    SYSTEM_PROMPT_BASE +
      ' JSON으로 답변하세요. 형식: [{"title":"...","content":"...","decisionDate":"YYYY-MM-DD","decidedBy":"이름"}]. ' +
      "JSON 배열만 출력하세요.",
    `다음 대화에서 공식 결정 사항을 추출해 JSON 배열로 만드세요. 결정으로 보기 어려운 잡담은 제외하세요.\n\n${transcript(messages)}`
  );
}

export async function draftNotice(messages: ChatMessage[]): Promise<AiResult> {
  return complete(
    SYSTEM_PROMPT_BASE +
      " 사내 공지문 초안 형식으로 작성하세요: 첫 줄에 제목, 빈 줄, 본문 (목적/내용/일정/문의 순).",
    `다음 대화 내용을 바탕으로 사내 공지 초안을 작성하세요:\n\n${transcript(messages)}`
  );
}

export async function minutes(messages: ChatMessage[]): Promise<AiResult> {
  return complete(
    SYSTEM_PROMPT_BASE +
      " 회의록 형식으로 작성하세요: 일시, 참석자, 안건, 논의 내용, 결정 사항, Action items 순.",
    `다음 대화를 회의록으로 정리하세요:\n\n${transcript(messages)}`
  );
}
