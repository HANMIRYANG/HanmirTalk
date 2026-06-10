"use client";

import {
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction
} from "react";
import type { MessageEntity } from "@hanmir/shared";
import type { AiCommand } from "@/services/ai.service";
import { reconcileEntities } from "./useComposerText";

export interface SlashCommandItem {
  trigger: string;
  command: AiCommand;
  description: string;
}

// Phase 5 H-5 — slash command catalog. label은 textarea의 매치용,
// description은 popover에 표시.
export const SLASH_COMMANDS: SlashCommandItem[] = [
  { trigger: "/요약", command: "chat-summary", description: "최근 메시지를 요약" },
  { trigger: "/업무추출", command: "extract-tasks", description: "행동 항목 추출 (JSON)" },
  { trigger: "/결정사항", command: "extract-decisions", description: "결정 사항 추출 (JSON)" },
  { trigger: "/공지초안", command: "draft-notice", description: "공지문 초안 작성" },
  { trigger: "/회의록", command: "minutes", description: "회의록 형식으로 정리" }
];

interface UseSlashCommandsArgs {
  value: string;
  setValue: (next: string) => void;
  setEntities: Dispatch<SetStateAction<MessageEntity[]>>;
  onCommand: (command: AiCommand) => void;
}

// 슬래시 명령 picker 상태 묶음 — 후보 필터링, 명령 확정(입력한 "/query"
// 제거 후 onCommand 호출), picker 전용 키보드 내비게이션을 담당한다.
export function useSlashCommands({
  value,
  setValue,
  setEntities,
  onCommand
}: UseSlashCommandsArgs) {
  // Phase 5 H-5 — slash command popover state. Independent from mention
  // picker; the two cannot both be open since their triggers ("/" vs
  // "@") are mutually exclusive within the same caret context.
  const [slashPicker, setSlashPicker] = useState<{ start: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const slashMatches = slashPicker
    ? SLASH_COMMANDS.filter(
        (c) =>
          c.trigger.toLowerCase().startsWith(slashPicker.query.toLowerCase()) ||
          slashPicker.query === "/"
      )
    : [];

  const triggerSlashCommand = (command: AiCommand) => {
    if (!slashPicker) return;
    // Remove the "/query" the user typed so we don't accidentally send
    // it as a message later.
    const before = value.slice(0, slashPicker.start);
    const after = value.slice(slashPicker.start + slashPicker.query.length);
    const cleared = before + after;
    setValue(cleared);
    setEntities((prev) => reconcileEntities(cleared, prev));
    setSlashPicker(null);
    onCommand(command);
  };

  // picker 가 열려 있고 매치가 있을 때의 키 처리. 소비한 키만 true 를
  // 반환 — 호출부(onKeyDown)는 true 면 이후 처리를 건너뛴다.
  const handleSlashKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!slashPicker || slashMatches.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((i) => Math.min(i + 1, slashMatches.length - 1));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((i) => Math.max(i - 1, 0));
      return true;
    }
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      const choice = slashMatches[slashIndex];
      if (choice) triggerSlashCommand(choice.command);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSlashPicker(null);
      return true;
    }
    return false;
  };

  return {
    slashPicker,
    setSlashPicker,
    slashIndex,
    setSlashIndex,
    slashMatches,
    triggerSlashCommand,
    handleSlashKeyDown
  };
}
