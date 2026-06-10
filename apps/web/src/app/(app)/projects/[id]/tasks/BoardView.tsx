"use client";

import type { TaskItem, TaskStatus, User } from "@hanmir/shared";
import { taskPriorityLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PRIO_TONE, resolveAssignees } from "./taskViewUtils";
import styles from "./tasks.module.css";

const BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "할일" },
  { status: "in_progress", label: "진행중" },
  { status: "review", label: "검토중" },
  { status: "on_hold", label: "보류" },
  { status: "done", label: "완료" }
];

export function BoardView({
  tasks,
  userById
}: {
  tasks: TaskItem[];
  userById: Map<string, User>;
}) {
  return (
    <div className={styles.board}>
      {BOARD_COLUMNS.map((col) => {
        const list = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className={styles.boardCol}>
            <div className={styles.boardColHead}>
              <span className={styles.boardColLabel}>{col.label}</span>
              <span className={styles.boardColCount}>{list.length}</span>
            </div>
            <div className={styles.boardColBody}>
              {list.length === 0 ? (
                <div className={styles.boardEmpty}>없음</div>
              ) : (
                list.map((t) => (
                  <div key={t.id} className={styles.boardCard}>
                    <div className={styles.boardCardTitle}>{t.title}</div>
                    <div className={styles.boardCardMeta}>
                      <span className={styles.boardCardCode}>{t.code}</span>
                      <Tag tone={PRIO_TONE[t.priority]}>{taskPriorityLabel[t.priority]}</Tag>
                    </div>
                    <ProgressBar value={t.progress} className={styles.boardCardProgress} />
                    <div className={styles.boardCardFoot}>
                      <span>{t.dueLabel}</span>
                      <div className={styles.assignees}>
                        {resolveAssignees(t, userById).slice(0, 3).map((u) => (
                          <Avatar
                            key={u.id}
                            initials={u.initials}
                            tone={u.avatarTone ?? "default"}
                            className={styles.assigneeAvatar}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
