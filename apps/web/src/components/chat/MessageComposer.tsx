"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from "react";
import { useRouter } from "next/navigation";
import type { FileEntry, MentionSearchResult, MessageEntity } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import {
  BoldIcon,
  CloseIcon,
  EmojiIcon,
  ItalicIcon,
  ListIcon,
  MentionIcon,
  PaperclipIcon,
  TaskIcon
} from "@/components/ui/icons";
import { chatService } from "@/services/chat.service";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { cn } from "@/lib/classNames";
import { AiCommandModal } from "./AiCommandModal";
import type { AiCommand } from "@/services/ai.service";
import styles from "./MessageComposer.module.css";

// Phase 5 H-5 — slash command catalog. label은 textarea의 매치용,
// description은 popover에 표시.
const SLASH_COMMANDS: { trigger: string; command: AiCommand; description: string }[] = [
  { trigger: "/요약", command: "chat-summary", description: "최근 메시지를 요약" },
  { trigger: "/업무추출", command: "extract-tasks", description: "행동 항목 추출 (JSON)" },
  { trigger: "/결정사항", command: "extract-decisions", description: "결정 사항 추출 (JSON)" },
  { trigger: "/공지초안", command: "draft-notice", description: "공지문 초안 작성" },
  { trigger: "/회의록", command: "minutes", description: "회의록 형식으로 정리" }
];

interface MessageComposerProps {
  roomId: string;
  roomName: string;
  // Used as upload scope so attachments uploaded from a project room land
  // tagged with the project, making them visible on /projects/[id]/files.
  projectId?: string;
}

// Phase 5 H-2 — mention popover state. `start` is the offset of the `@`
// character in `value`; the popover is open whenever start !== null.
interface MentionPickerState {
  start: number;
  query: string;
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
  const [attachment, setAttachment] = useState<FileEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState<MentionPickerState | null>(null);
  const [pickerResults, setPickerResults] = useState<MentionSearchResult[]>([]);
  const [pickerIndex, setPickerIndex] = useState(0);
  // Phase 5 H-5 — slash command popover state. Independent from mention
  // picker; the two cannot both be open since their triggers ("/" vs
  // "@") are mutually exclusive within the same caret context.
  const [slashPicker, setSlashPicker] = useState<{ start: number; query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [aiCommand, setAiCommand] = useState<AiCommand | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const pickAttachment = () => {
    if (uploading || sending) return;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await fileService.uploadFile(file, projectId ? { projectId } : {});
      setAttachment(uploaded);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      if (err instanceof ApiError && err.status === 413) {
        setError("파일이 너무 큽니다.");
      } else {
        setError("파일 업로드에 실패했습니다.");
      }
    } finally {
      setUploading(false);
    }
  };

  const clearAttachment = () => setAttachment(null);

  // Reconcile entities against current `value`: drop any entity whose
  // text substring no longer matches what's at its offset/length.
  const reconcileEntities = (newValue: string, list: MessageEntity[]): MessageEntity[] => {
    return list.filter((e) => {
      const slice = newValue.slice(e.offset, e.offset + e.length);
      return slice === `@${e.label}` || slice === e.label;
    });
  };

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
      const slashIndex = before.length - slashMatch[1].length;
      setSlashPicker({ start: slashIndex, query: slashMatch[1] });
      setPicker(null);
    } else {
      setPicker(null);
      setSlashPicker(null);
    }
  };

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
    setAiCommand(command);
  };

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

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (picker && pickerResults.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPickerIndex((i) => Math.min(i + 1, pickerResults.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setPickerIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const result = pickerResults[pickerIndex];
        if (result) insertMention(result);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        return;
      }
    }
    if (slashPicker && slashMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, slashMatches.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const choice = slashMatches[slashIndex];
        if (choice) triggerSlashCommand(choice.command);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashPicker(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.box}>
        <div className={styles.toolbar}>
          <button className={styles.tbBtn} title="굵게" type="button">
            <BoldIcon size={14} />
          </button>
          <button className={styles.tbBtn} title="기울임" type="button">
            <ItalicIcon size={14} />
          </button>
          <button className={styles.tbBtn} title="목록" type="button">
            <ListIcon size={14} />
          </button>
          <span className={styles.divider} />
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={onFileSelected}
          />
          <button
            className={styles.tbBtn}
            title="파일 첨부"
            type="button"
            onClick={pickAttachment}
            disabled={uploading || sending}
          >
            <PaperclipIcon size={16} />
          </button>
          <button
            className={styles.tbBtn}
            title="멘션 (텍스트에 @ 입력)"
            type="button"
            onClick={() => {
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
            }}
          >
            <MentionIcon size={14} />
          </button>
          <button className={styles.tbBtn} title="이모지" type="button">
            <EmojiIcon size={14} />
          </button>
          <span className={styles.divider} />
          <button className={styles.tbBtn} title="업무 만들기" type="button">
            <TaskIcon size={14} />
          </button>
        </div>
        <div className={styles.inputWrap}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            rows={2}
            placeholder={`${roomName} 에 메시지 보내기...`}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
          />
          {slashPicker && slashMatches.length > 0 ? (
            <div className={styles.mentionPopover} role="listbox" aria-label="AI 명령">
              {slashMatches.map((c, i) => (
                <button
                  key={c.command}
                  type="button"
                  className={cn(
                    styles.mentionRow,
                    i === slashIndex && styles.mentionRowActive
                  )}
                  onMouseEnter={() => setSlashIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    triggerSlashCommand(c.command);
                  }}
                  role="option"
                  aria-selected={i === slashIndex}
                >
                  <span className={styles.mentionTypeIcon}>✨</span>
                  <div className={styles.mentionMeta}>
                    <div className={styles.mentionLabel}>{c.trigger}</div>
                    <div className={styles.mentionSublabel}>{c.description}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          {picker ? (
            <div className={styles.mentionPopover} role="listbox">
              {pickerResults.length === 0 ? (
                <div className={styles.mentionEmpty}>
                  검색 결과 없음 (계속 입력하거나 Esc로 닫기)
                </div>
              ) : (
                pickerResults.map((r, i) => (
                  <button
                    key={`${r.type}:${r.id}`}
                    type="button"
                    className={cn(
                      styles.mentionRow,
                      i === pickerIndex && styles.mentionRowActive
                    )}
                    onMouseEnter={() => setPickerIndex(i)}
                    onMouseDown={(e) => {
                      // mousedown not click — click would steal focus
                      // from textarea after blur runs.
                      e.preventDefault();
                      insertMention(r);
                    }}
                    role="option"
                    aria-selected={i === pickerIndex}
                  >
                    {r.initials ? (
                      <Avatar
                        initials={r.initials}
                        tone={r.avatarTone ?? "default"}
                        size="sm"
                      />
                    ) : (
                      <span className={styles.mentionTypeIcon}>
                        {r.type === "department"
                          ? "🏢"
                          : r.type === "project"
                          ? "📁"
                          : r.type === "task"
                          ? "✅"
                          : r.type === "file"
                          ? "📄"
                          : "@"}
                      </span>
                    )}
                    <div className={styles.mentionMeta}>
                      <div className={styles.mentionLabel}>{r.label}</div>
                      {r.sublabel ? (
                        <div className={styles.mentionSublabel}>{r.sublabel}</div>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
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
            줄바꿈 · <span className="kbd">@</span> 멘션 ·{" "}
            <span className="kbd">/</span> AI 명령
          </div>
          <div className={styles.send}>
            <button className="btn btn--outline btn--sm" type="button" disabled={sending}>
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
    </div>
  );
}
