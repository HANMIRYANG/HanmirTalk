"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ChatMessage, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { PinIcon } from "@/components/ui/icons";
import { cn } from "@/lib/classNames";
import dynamic from "next/dynamic";
import { MessagePinButton, usePinToggle } from "./MessagePinButton";
import { renderMessageBody } from "./message-item/MessageBody";
import {
  MessageContextMenu,
  type ContextMenuItem
} from "./message-item/MessageContextMenu";
import { MessageEditForm } from "./message-item/MessageEditForm";
import { MessageAttachmentCard } from "./message-item/MessageAttachmentCard";
import { ReactionBar } from "./message-item/ReactionBar";
import { ThreadChip } from "./message-item/ThreadChip";
import { useMessageActions } from "./message-item/useMessageActions";
import styles from "./MessageItem.module.css";

// 모달 2종은 열 때만 로드 — 메시지 1건마다 렌더되는 컴포넌트라 초기
// 번들 절감 효과가 크다 (조건부 렌더이므로 클릭 시점에 청크 로드).
const TaskCreateModal = dynamic(
  () =>
    import("@/app/(app)/projects/[id]/tasks/TaskCreateModal").then(
      (m) => m.TaskCreateModal
    ),
  { ssr: false }
);
const CreateDecisionFromMessageModal = dynamic(
  () =>
    import("./message-item/CreateDecisionModal").then(
      (m) => m.CreateDecisionFromMessageModal
    ),
  { ssr: false }
);
const MessageInfoModal = dynamic(
  () =>
    import("./message-item/MessageInfoModal").then((m) => m.MessageInfoModal),
  { ssr: false }
);

interface MessageItemProps {
  message: ChatMessage;
  // Optional context for actions. When omitted, only the read-only render
  // is produced (e.g. for embedding messages elsewhere).
  roomId?: string;
  isPinned?: boolean;
  canPin?: boolean;
  // Phase 2 E-1 — passed by the chat room page so MessageItem can decide
  // whether to show "수정 / 삭제" hover actions. Author can do both;
  // admins can delete others' messages (server enforces this too).
  currentUserId?: string;
  isAdmin?: boolean;
  // Phase 3 F-2c — show "결정사항으로 만들기" hover action when (1) the
  // room is project-bound (projectId set) AND (2) the caller has writer
  // role. Server enforces both too via /messages/:id/create-decision.
  canCreateDecision?: boolean;
  projectId?: string;
  // Phase 10 M-3 — 메시지 → 업무 만들기. canCreateDecision 과 같은
  // 게이트 (프로젝트 방 + writer 역할). users 가 같이 제공되어야
  // TaskCreateModal 의 담당자 선택 목록을 채울 수 있다.
  canCreateTask?: boolean;
  users?: User[];
  // Phase 11 — 답글 chip 또는 [답글 달기] 버튼 클릭 시 호출되는 콜백.
  // 상위(ChatRoomMessages) 가 ThreadDrawer state 를 관리한다.
  onOpenThread?: (message: ChatMessage) => void;
}

export function MessageItem({
  message,
  roomId,
  isPinned = false,
  canPin = false,
  currentUserId,
  isAdmin = false,
  canCreateDecision = false,
  projectId,
  canCreateTask = false,
  users,
  onOpenThread
}: MessageItemProps) {
  const {
    editing,
    draft,
    setDraft,
    busy,
    error,
    startEdit,
    cancelEdit,
    saveEdit,
    onConfirmDelete,
    onKeyDown
  } = useMessageActions(message);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  // 우클릭 컨텍스트 메뉴 — 열림 좌표 (null 이면 닫힘).
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const pin = usePinToggle({
    roomId: roomId ?? "",
    messageId: message.id,
    isPinned
  });

  if (message.isSystem) {
    return (
      <div className={styles.sys}>
        <span>{message.body}</span>
      </div>
    );
  }

  const isMine = !!currentUserId && message.authorId === currentUserId;
  const canEdit = isMine && !message.isDeleted;
  const canDelete = (isMine || isAdmin) && !message.isDeleted;
  // 읽음/반응 확인 — 방 컨텍스트가 있는 메시지면 멤버 누구나 (서버도
  // 멤버십만 검증).
  const canViewInfo = !!roomId && !!currentUserId && !message.isDeleted;

  // 우클릭 메뉴 항목 — hover 액션과 동일한 게이트에 답글/고정을 더한
  // 전체 목록. 항목이 없으면 브라우저 기본 메뉴를 그대로 둔다.
  const menuItems: ContextMenuItem[] = [];
  if (!editing && !message.isDeleted) {
    if (onOpenThread) {
      menuItems.push({
        key: "thread",
        label: "답글 달기",
        onSelect: () => onOpenThread(message)
      });
    }
    if (canViewInfo) {
      menuItems.push({
        key: "info",
        label: "읽음·반응 확인",
        onSelect: () => setInfoModalOpen(true)
      });
    }
    if (canPin && roomId) {
      menuItems.push({
        key: "pin",
        label: isPinned ? "고정 해제" : "메시지 고정",
        disabled: pin.busy,
        onSelect: pin.toggle
      });
    }
    if (canCreateTask && projectId && users) {
      menuItems.push({
        key: "task",
        label: "업무로 만들기",
        onSelect: () => setTaskModalOpen(true)
      });
    }
    if (canCreateDecision && projectId) {
      menuItems.push({
        key: "decision",
        label: "결정사항으로 만들기",
        onSelect: () => setDecisionModalOpen(true)
      });
    }
    if (canEdit) {
      menuItems.push({ key: "edit", label: "수정", onSelect: startEdit });
    }
    if (canDelete) {
      menuItems.push({
        key: "delete",
        label: "삭제",
        danger: true,
        disabled: busy,
        onSelect: onConfirmDelete
      });
    }
  }

  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (menuItems.length === 0) return;
    // 텍스트를 드래그 선택한 상태면 복사 등 기본 메뉴가 더 유용하다.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={cn(
        styles.msg,
        message.groupedWithPrev && styles.grouped,
        message.isDeleted && styles.deleted
      )}
      onContextMenu={onContextMenu}
    >
      <div className={styles.avatarBlock}>
        <Avatar
          initials={message.initials}
          tone={message.avatarTone ?? "default"}
          className={styles.avatar}
        />
      </div>
      <div className={styles.content}>
        <div className={styles.head}>
          <span className={styles.name}>{message.authorName}</span>
          {message.authorRole ? <span className={styles.role}>{message.authorRole}</span> : null}
          <span className={styles.time}>{message.createdAt}</span>
          {message.editedAt && !message.isDeleted ? (
            <span className={styles.editedTag} title={`수정됨: ${message.editedAt}`}>
              (수정됨)
            </span>
          ) : null}
          {isPinned && !message.isDeleted ? (
            <span className={styles.pinTag} title="고정된 메시지">
              <PinIcon size={11} /> 고정됨
            </span>
          ) : null}
          {canPin && roomId && !message.isDeleted ? (
            <MessagePinButton
              roomId={roomId}
              messageId={message.id}
              isPinned={isPinned}
            />
          ) : null}
          {(canEdit ||
            canDelete ||
            canViewInfo ||
            (canCreateDecision && !message.isDeleted) ||
            (canCreateTask && !message.isDeleted && projectId && users)) &&
          !editing ? (
            <span className={styles.actions}>
              {canViewInfo ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setInfoModalOpen(true)}
                  aria-label="읽음·반응 확인"
                  title="누가 읽었고 누가 반응했는지 확인"
                >
                  읽음
                </button>
              ) : null}
              {canCreateTask && !message.isDeleted && projectId && users ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setTaskModalOpen(true)}
                  aria-label="업무로 만들기"
                  title="이 메시지를 프로젝트 업무로 추가"
                >
                  업무
                </button>
              ) : null}
              {canCreateDecision && !message.isDeleted && projectId ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setDecisionModalOpen(true)}
                  aria-label="결정사항으로 만들기"
                  title="이 메시지를 프로젝트 결정사항으로 기록"
                >
                  결정사항
                </button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={startEdit}
                  aria-label="수정"
                >
                  수정
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className={cn(styles.actionBtn, styles.actionDanger)}
                  onClick={onConfirmDelete}
                  disabled={busy}
                  aria-label="삭제"
                >
                  삭제
                </button>
              ) : null}
            </span>
          ) : null}
        </div>

        {editing ? (
          <MessageEditForm
            draft={draft}
            setDraft={setDraft}
            busy={busy}
            error={error}
            onKeyDown={onKeyDown}
            onCancel={cancelEdit}
            onSave={saveEdit}
          />
        ) : (
          <div className={styles.body}>
            {message.aiGenerated && !message.isDeleted ? (
              <span className={styles.aiBadge} title="AI 명령으로 생성된 메시지">
                AI 초안
              </span>
            ) : null}
            {renderMessageBody(message)}
          </div>
        )}

        {message.attachment && !message.isDeleted ? (
          <MessageAttachmentCard attachment={message.attachment} />
        ) : null}

        {!message.isDeleted ? <ReactionBar message={message} /> : null}

        {/* Phase 11 — 답글 chip. count 가 0 이어도 (작성자가 아니어도) 답글
            을 시작할 수 있도록 onOpenThread 가 있고 deleted 가 아니면 항상
            노출. 표시 텍스트는 count 에 따라 분기. */}
        {!message.isDeleted && onOpenThread ? (
          <ThreadChip message={message} onOpenThread={onOpenThread} />
        ) : null}
      </div>
      {decisionModalOpen && projectId ? (
        <CreateDecisionFromMessageModal
          messageId={message.id}
          messageBody={message.body}
          projectId={projectId}
          onClose={() => setDecisionModalOpen(false)}
        />
      ) : null}
      {taskModalOpen && projectId && users ? (
        <TaskCreateModal
          open
          onClose={() => setTaskModalOpen(false)}
          projectId={projectId}
          users={users}
          defaultStatus="todo"
          initialTitle={message.body.split("\n")[0]?.slice(0, 80) ?? ""}
          initialDescription={message.body}
        />
      ) : null}
      {infoModalOpen ? (
        <MessageInfoModal
          messageId={message.id}
          onClose={() => setInfoModalOpen(false)}
        />
      ) : null}
      {menuPos ? (
        <MessageContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={menuItems}
          onClose={() => setMenuPos(null)}
        />
      ) : null}
    </div>
  );
}
