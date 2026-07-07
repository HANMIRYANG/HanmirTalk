// MEETING_AI_MOCK=true — Gemini 전사/Claude 회의록 호출을 대체하는 목.
// API 키 없이 회의 파이프라인 전체(E2E)를 돌려볼 수 있게 한다.
// MEETING_MOCK_FAIL_ONCE=true 면 첫 전사 호출이 1회 실패해 워커의
// 재시도(releaseClaim → 다음 tick) 경로를 검증할 수 있다.
import type { MeetingMinutesData } from "@hanmir/shared";
import type { TranscribeSegmentInput, TranscriptionProvider } from "./transcription";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockFailedOnce = false;

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock-transcriber";

  async transcribeSegment(input: TranscribeSegmentInput): Promise<{ text: string }> {
    await delay(300);
    if (process.env.MEETING_MOCK_FAIL_ONCE === "true" && !mockFailedOnce) {
      mockFailedOnce = true;
      throw new Error("mock_transcribe_failure");
    }
    const term = input.glossary[0]?.term ?? "한미르";
    return {
      text: [
        `[00:05] 화자1: (목 전사) 세그먼트 ${input.segIndex} 논의를 시작하겠습니다.`,
        `[00:12] 화자2: ${term} 신제품 출시 일정을 다음 달로 확정하는 안건입니다.`,
        `[00:30] 화자1: 좋습니다. 품질검사 결과를 김대리가 금요일까지 공유하기로 합니다.`,
        `[00:47] 화자2: 동의합니다. 그럼 해당 안건은 확정으로 정리하겠습니다.`
      ].join("\n")
    };
  }
}

export async function mockGenerateMinutes(): Promise<{
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  await delay(300);
  const data: MeetingMinutesData = {
    overview: "(목) 신제품 출시 일정 확정을 위한 회의.",
    attendees: ["화자1", "화자2"],
    agenda: [
      {
        topic: "신제품 출시 일정",
        discussion: ["출시 일정을 다음 달로 확정하는 안건 논의", "품질검사 결과 공유 필요성 확인"]
      }
    ],
    decisions: ["신제품 출시 일정을 다음 달로 확정"],
    actionItems: [{ assignee: "김대리", item: "품질검사 결과 공유", due: "금요일" }]
  };
  return {
    text: "```json\n" + JSON.stringify(data, null, 2) + "\n```",
    usage: { inputTokens: 0, outputTokens: 0 }
  };
}
