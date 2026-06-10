"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { useRouter } from "next/navigation";
import type { MessageEntity } from "@hanmir/shared";
import { CloseIcon } from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import dynamic from "next/dynamic";
import type { AiCommand } from "@/services/ai.service";

// AI 명령/예약 전송 모달은 사용 시점에만 청크 로드.
const AiCommandModal = dynamic(
  () => import("./AiCommandModal").then((m) => m.AiCommandModal),
  { ssr: false }
);
const ScheduleSendModal = dynamic(
  () => import("./ScheduleSendModal").then((m) => m.ScheduleSendModal),
  { ssr: false }
);
import { ComposerHighlighter } from "./composer/ComposerHighlighter";
import { ComposerToolbar } from "./composer/ComposerToolbar";
import { MentionPopover } from "./composer/MentionPopover";
import { SlashCommandPopover } from "./composer/SlashCommandPopover";
import { reconcileEntities, useComposerText } from "./composer/useComposerText";
import { useComposerAttachment } from "./composer/useComposerAttachment";
import { useMentionPicker } from "./composer/useMentionPicker";
import { useSlashCommands } from "./composer/useSlashCommands";
import styles from "./MessageComposer.module.css";

interface MessageComposerProps {
  roomId: string;
  roomName: string;
  // Used as upload scope so attachments uploaded from a project room land
  // tagged with the project, making them visible on /projects/[id]/files.
  projectId?: string;
}

export function MessageComposer({ roomId, roomName, projectId }: MessageComposerProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  // Phase 5 H-2 — entities tracked alongside value. We don't try to keep
  // offsets in sync on arbitrary edits (e.g. deleting characters before
  // a mention); instead any edit that breaks the entity's text removes
  // it. The reconcile step runs on every value change.
  const [entities, setEntities] = useState<MessageEntity[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiCommand, setAiCommand] = useState<AiCommand | null>(null);
  // Phase 10 M-4 — 예약 전송 모달. 본문/첨부/entities 가 비면 toolbar
  // 버튼이 비활성. 성공 시 onScheduled() 가 composer state 를 초기화.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 멘션 하이라이트 백드롭 — textarea 와 동일한 글꼴/패딩으로 뒤에 깔려
  // entity 구간에만 파란 배경 pill 을 그린다. 스크롤은 onScroll 로 동기화.
  const highlighterRef = useRef<HTMLDivElement>(null);

  const { attachment, setAttachment, uploading, fileInputRef, pickAttachment, onFileSelected, clearAttachment } =
    useComposerAttachment({ projectId, sending, setError });

  const { wrapSelection, prefixLines, insertAtCaret } =
    useComposerText({ value, setValue, setEntities, textareaRef });

  const { picker, setPicker, pickerResults, pickerIndex, setPickerIndex, insertMention, handlePickerKeyDown } =
    useMentionPicker({ value, setValue, setEntities, textareaRef });

  const { slashPicker, setSlashPicker, slashIndex, setSlashIndex, slashMatches, triggerSlashCommand, handleSlashKeyDown } =
    useSlashCommands({ value, setValue, setEntities, onCommand: setAiCommand });

  // 백드롭이 늦게 마운트되거나(첫 멘션 추가) 값이 바뀐 직후에도 textarea
  // 의 현재 스크롤 위치와 어긋나지 않도록 동기화.
  useEffect(() => {
    const ta = textareaRef.current;
    const hl = highlighterRef.current;
    if (!ta || !hl) return;
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  }, [value, entities]);

  const onValueChange = (nextValue: string) => {
    setValue(nextValue);
    setEntities((prev) => reconcileEntities(nextValue, prev));
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? nextValue.length;
    const before = nextValue.slice(0, caret);
    // @-mention picker: "@" then non-whitespace.
    const mentionMatch = /@(\S*)$/.exec(before);
    // Slash command picker: "/" must be at line start (or after newline)
    // and not preceded by alphanumeric. Body text "URL이/이런" 등은 무시.
    const slashMatch = /(?:^|\n)(\/\S*)$/.exec(before);
    if (mentionMatch && !slashMatch) {
      const atIndex = before.length - mentionMatch[0].length;
      setPicker({ start: atIndex, query: mentionMatch[1] });
      setSlashPicker(null);
    } else if (slashMatch) {
      const slashStart = before.length - slashMatch[1].length;
      setSlashPicker({ start: slashStart, query: slashMatch[1] });
      setPicker(null);
    } else {
      setPicker(null);
      setSlashPicker(null);
    }
  };

  const onMentionButtonClick = () => {
    // Insert "@" at caret to trigger the popover.
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const next = value.slice(0, caret) + "@" + value.slice(caret);
    onValueChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = caret + 1;
      ta.setSelectionRange(pos, pos);
    });
  };

  const syncHighlightScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const hl = highlighterRef.current;
    if (!hl) return;
    hl.scrollTop = e.currentTarget.scrollTop;
    hl.scrollLeft = e.currentTarget.scrollLeft;
  };

  const send = async () => {
    const trimmed = value.trim();
    if ((!trimmed && !attachment) || sending) return;
    setSending(true);
    setError(null);
    try {
      // Re-reconcile against the (possibly trimmed) body sent to server.
      // We send the un-trimmed `value` so entity offsets stay valid; the
      // server validates again.
      const finalEntities = reconcileEntities(value, entities);
      await chatService.sendMessage(roomId, trimmed, {
        attachmentId: attachment?.id,
        entities: finalEntities.length > 0 ? finalEntities : undefined
      });
      setValue("");
      setEntities([]);
      setAttachment(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("세션이 만료되었습니다. 다시 로그인해 주세요.");
        handleSessionExpired(router);
      } else if (err instanceof ApiError && err.status === 403) {
        setError("이 채팅방에 메시지를 보낼 권한이 없습니다.");
      } else {
        setError("메시지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSending(false);
    }
  };

  // 키 처리 우선순위는 분할 전과 동일: 멘션 picker → 슬래시 picker →
  // Enter 전송. picker 핸들러가 true(키 소비)면 이후 단계는 건너뛴다.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (handlePickerKeyDown(event)) return;
    if (handleSlashKeyDown(event)) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.box}>
        <ComposerToolbar
          sending={sending}
          uploading={uploading}
          fileInputRef={fileInputRef}
          onFileSelected={onFileSelected}
          onPickAttachment={pickAttachment}
          onWrapSelection={wrapSelection}
          onPrefixLines={prefixLines}
          onMentionClick={onMentionButtonClick}
          onPickEmoji={insertAtCaret}
        />
        <div className={styles.inputWrap}>
          {entities.length > 0 ? (
            <ComposerHighlighter
              value={value}
              entities={entities}
              highlighterRef={highlighterRef}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            className={styles.input}
            rows={2}
            placeholder={`${roomName} 에 메시지 보내기...`}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={syncHighlightScroll}
            disabled={sending}
          />
          {slashPicker && slashMatches.length > 0 ? (
            <SlashCommandPopover
              matches={slashMatches}
              activeIndex={slashIndex}
              onPick={triggerSlashCommand}
              onHover={setSlashIndex}
            />
          ) : null}
          {picker ? (
            <MentionPopover
              results={pickerResults}
              activeIndex={pickerIndex}
              onPick={insertMention}
              onHover={setPickerIndex}
            />
          ) : null}
        </div>
        {uploading ? (
          <div className={styles.attachChip} role="status">
            <span>파일 업로드 중...</span>
          </div>
        ) : null}
        {attachment ? (
          <div className={styles.attachChip}>
            <span title={attachment.name} className={styles.attachName}>
              📎 {attachment.name}
            </span>
            <span className={styles.attachMeta}>{attachment.size}</span>
            <button
              type="button"
              className={styles.attachRemove}
              onClick={clearAttachment}
              aria-label="첨부 제거"
              title="첨부 제거"
              disabled={sending}
            >
              <CloseIcon size={12} />
            </button>
          </div>
        ) : null}
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        <div className={styles.foot}>
          <div className={styles.hint}>
            <span className="kbd">Enter</span> 전송 · <span className="kbd">Shift + Enter</span>{" "}
            줄바꿈 · <span className="kbd">@</span> 멘션 (<span className="kbd">↑↓</span> 이동,{" "}
            <span className="kbd">Tab</span>/<span className="kbd">Enter</span> 선택) ·{" "}
            <span className="kbd">/</span> AI 명령
          </div>
          <div className={styles.send}>
            <button
              className="btn btn--outline btn--sm"
              type="button"
              disabled={sending || uploading || (!value.trim() && !attachment)}
              onClick={() => setScheduleOpen(true)}
              title="지정한 시각에 자동 전송"
            >
              예약 전송
            </button>
            <button
              className="btn btn--primary btn--sm"
              type="button"
              onClick={send}
              disabled={sending || uploading || (!value.trim() && !attachment)}
            >
              {sending ? "전송 중..." : "전송 →"}
            </button>
          </div>
        </div>
      </div>
      {aiCommand ? (
        <AiCommandModal
          roomId={roomId}
          command={aiCommand}
          onClose={() => setAiCommand(null)}
        />
      ) : null}
      {scheduleOpen ? (
        // 조건부 마운트 — dynamic 청크가 버튼 클릭 시점에만 로드된다.
        // ScheduleSendModal 은 [open] effect 로 폼을 초기화하므로 마운트
        // 시점에 open=true 여도 동일하게 동작한다.
        <ScheduleSendModal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          roomId={roomId}
          body={value}
          entities={entities}
          attachment={attachment}
          onScheduled={() => {
            // 예약 성공 → composer 입력 초기화. 일반 전송 직후와 동일.
            setValue("");
            setEntities([]);
            setAttachment(null);
          }}
        />
      ) : null}
    </div>
  );
}
