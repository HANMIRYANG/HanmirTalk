"use client";

import type { TaskItem, User } from "@hanmir/shared";
import { taskStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { STATUS_TONE, resolveAssignees } from "./taskViewUtils";
import styles from "./tasks.module.css";

export function TimelineView({
  tasks,
  userById
}: {
  tasks: TaskItem[];
  userById: Map<string, User>;
}) {
  const byDate = [...tasks].sort((a, b) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
  );
  return (
    <div className={styles.timeline}>
      {byDate.length === 0 ? (
        <div className={styles.empty}>표시할 업무가 없습니다.</div>
      ) : (
        byDate.map((t) => (
          <div key={t.id} className={styles.timelineRow}>
            <div className={styles.timelineDate}>{t.dueLabel}</div>
            <div className={styles.timelineCard}>
              <div className={styles.timelineHead}>
                <Tag tone={STATUS_TONE[t.status]} dot>
                  {taskStatusLabel[t.status]}
                </Tag>
                <span className={styles.timelineTitle}>{t.title}</span>
                <span className={styles.timelineCode}>{t.code}</span>
              </div>
              <div className={styles.timelineMeta}>
                <ProgressBar value={t.progress} className={styles.timelineProgress} />
                <span>{t.progress}%</span>
                <div className={styles.assignees}>
                  {resolveAssignees(t, userById).map((u) => (
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
          </div>
        ))
      )}
    </div>
  );
}
