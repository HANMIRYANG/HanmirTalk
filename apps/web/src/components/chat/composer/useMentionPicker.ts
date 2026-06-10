"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction
} from "react";
import type { MentionSearchResult, MessageEntity } from "@hanmir/shared";
import { chatService } from "@/services/chat.service";
import { reconcileEntities } from "./useComposerText";

// Phase 5 H-2 — mention popover state. `start` is the offset of the `@`
// character in `value`; the popover is open whenever start !== null.
export interface MentionPickerState {
  start: number;
  query: string;
}

interface UseMentionPickerArgs {
  value: string;
  setValue: (next: string) => void;
  setEntities: Dispatch<SetStateAction<MessageEntity[]>>;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

// 멘션 picker 상태 묶음 — 디바운스 검색, 결과/활성 인덱스, 멘션 삽입과
// picker 전용 키보드 내비게이션(↑↓/Tab/Enter/Esc)을 담당한다.
export function useMentionPicker({
  value,
  setValue,
  setEntities,
  textareaRef
}: UseMentionPickerArgs) {
  const [picker, setPicker] = useState<MentionPickerState | null>(null);
  const [pickerResults, setPickerResults] = useState<MentionSearchResult[]>([]);
  const [pickerIndex, setPickerIndex] = useState(0);

  // Debounced search whenever the picker query changes.
  useEffect(() => {
    if (!picker) {
      setPickerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const list = await chatService.searchMentions(picker.query, {
          scope: ["user"],
          limit: 8
        });
        setPickerResults(list);
        setPickerIndex(0);
      } catch {
        setPickerResults([]);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [picker]);

  const closePicker = () => {
    setPicker(null);
    setPickerResults([]);
  };

  // Insert the selected mention into the textarea, replacing the
  // in-progress "@query" with "@Label " and appending an entity.
  const insertMention = (result: MentionSearchResult) => {
    if (!picker) return;
    const before = value.slice(0, picker.start);
    const after = value.slice(picker.start + 1 + picker.query.length); // skip "@query"
    const tokenLabel = result.label;
    const insertedText = `@${tokenLabel} `;
    const newValue = before + insertedText + after;
    const newEntity: MessageEntity = {
      type: result.type === "user" ? "mention" : (`${result.type}_ref` as MessageEntity["type"]),
      id: result.id,
      label: tokenLabel,
      offset: picker.start,
      length: insertedText.trimEnd().length // "@Label" without trailing space
    };
    setValue(newValue);
    setEntities((prev) =>
      reconcileEntities(newValue, [...prev, newEntity])
    );
    closePicker();
    // Restore caret right after the inserted "@Label ".
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const pos = picker.start + insertedText.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  // picker 가 열려 있고 결과가 있을 때의 키 처리. 소비한 키만 true 를
  // 반환 — 호출부(onKeyDown)는 true 면 이후 처리를 건너뛴다.
  const handlePickerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!picker || pickerResults.length === 0) return false;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPickerIndex((i) => Math.min(i + 1, pickerResults.length - 1));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setPickerIndex((i) => Math.max(i - 1, 0));
      return true;
    }
    // Tab 도 Enter 와 동일하게 확정 — 자동완성 관성 (IDE/카카오워크 등).
    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      const result = pickerResults[pickerIndex];
      if (result) insertMention(result);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return true;
    }
    return false;
  };

  return {
    picker,
    setPicker,
    pickerResults,
    pickerIndex,
    setPickerIndex,
    insertMention,
    handlePickerKeyDown
  };
}
