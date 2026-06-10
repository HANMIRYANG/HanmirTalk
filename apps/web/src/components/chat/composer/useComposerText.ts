"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { MessageEntity } from "@hanmir/shared";

// Reconcile entities against current `value`: drop any entity whose
// text substring no longer matches what's at its offset/length.
export const reconcileEntities = (
  newValue: string,
  list: MessageEntity[]
): MessageEntity[] => {
  return list.filter((e) => {
    const slice = newValue.slice(e.offset, e.offset + e.length);
    return slice === `@${e.label}` || slice === e.label;
  });
};

// Phase 10 — entity offsets 를 텍스트 변환 결과에 맞춰 조정한다.
// rangeStart..rangeEnd 가 변환된 영역(원본 인덱스 기준), shift 가 길이 변화.
// 정책:
//   - 영역 이전(end <= rangeStart) entity 는 그대로
//   - 영역 이후(offset >= rangeEnd) entity 는 offset += shift
//   - 영역과 겹치는 entity 는 drop (safe 조정 어려움 — Codex 검수와 일치)
// 마지막에 reconcileEntities 로 텍스트-라벨 일치를 재확인.
export const shiftEntities = (
  list: MessageEntity[],
  rangeStart: number,
  rangeEnd: number,
  shift: number
): MessageEntity[] => {
  const out: MessageEntity[] = [];
  for (const e of list) {
    const eEnd = e.offset + e.length;
    if (eEnd <= rangeStart) {
      out.push(e);
    } else if (e.offset >= rangeEnd) {
      out.push({ ...e, offset: e.offset + shift });
    }
    // else: overlap → drop
  }
  return out;
};

interface UseComposerTextArgs {
  value: string;
  setValue: (next: string) => void;
  setEntities: Dispatch<SetStateAction<MessageEntity[]>>;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

// Textarea 텍스트 편집 묶음 — value/entities state 와 textarea ref 를 받아
// 마크다운 래핑/줄 prefix/캐럿 삽입을 entity offset 보정과 함께 처리한다.
export function useComposerText({
  value,
  setValue,
  setEntities,
  textareaRef
}: UseComposerTextArgs) {
  // Apply a transform to the textarea: replace [start, end) in `value`
  // with `replacement`, update state, restore focus + put caret at
  // newCaret (relative to the new value), and reconcile entities.
  const applyTextEdit = (
    start: number,
    end: number,
    replacement: string,
    newCaretStart: number,
    newCaretEnd?: number
  ) => {
    const oldLen = end - start;
    const newLen = replacement.length;
    const shift = newLen - oldLen;
    const newValue = value.slice(0, start) + replacement + value.slice(end);
    setValue(newValue);
    setEntities((prev) => {
      const shifted = shiftEntities(prev, start, end, shift);
      return reconcileEntities(newValue, shifted);
    });
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const a = newCaretStart;
      const b = newCaretEnd ?? newCaretStart;
      ta.setSelectionRange(a, b);
    });
  };

  // Wrap the current selection with `prefix` + `suffix`. If nothing is
  // selected, inserts the pair and places the caret between them so the
  // user can type immediately.
  const wrapSelection = (prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const replacement = `${prefix}${selected}${suffix}`;
    if (selected) {
      // Keep the original text selected (now wrapped) so the next click
      // can toggle again, and so the markdown wrapper is visually obvious.
      applyTextEdit(
        start,
        end,
        replacement,
        start + prefix.length,
        start + prefix.length + selected.length
      );
    } else {
      // Empty selection — drop caret between the markers.
      applyTextEdit(start, end, replacement, start + prefix.length);
    }
  };

  // Prefix every non-empty line in [start, end] with `linePrefix`. The
  // selection is expanded to cover full lines first so partial-line
  // selections still affect the right lines.
  const prefixLines = (linePrefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart ?? 0;
    const selEnd = ta.selectionEnd ?? selStart;
    // Expand to full lines.
    const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
    let lineEnd = value.indexOf("\n", selEnd);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd);
    const transformed = block
      .split("\n")
      .map((line) => (line.length === 0 ? line : `${linePrefix}${line}`))
      .join("\n");
    const newCaret = lineStart + transformed.length;
    applyTextEdit(lineStart, lineEnd, transformed, lineStart, newCaret);
  };

  // Insert text at the current caret, replacing any selection. Used by
  // the emoji picker. Caret lands right after the inserted text.
  const insertAtCaret = (text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      // No textarea yet — append.
      const newValue = value + text;
      setValue(newValue);
      setEntities((prev) => reconcileEntities(newValue, prev));
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    applyTextEdit(start, end, text, start + text.length);
  };

  return { applyTextEdit, wrapSelection, prefixLines, insertAtCaret };
}
