"use client";

import type { TaskItem, User } from "@hanmir/shared";
import { taskPriorityLabel, taskStatusLabel } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PRIO_TONE, STATUS_TONE, resolveAssignees } from "./taskViewUtils";
import styles from "./tasks.module.css";

export function TableView({
  tasks,
  userById,
  onCsv
}: {
  tasks: TaskItem[];
  userById: Map<string, User>;
  onCsv: () => void;
}) {
  return (
    <div className={styles.tblWrap}>
      <div className={styles.tableTopBar}>
        <span className="muted t-xs">{tasks.length}건 표시</span>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={onCsv}
          style={{ marginLeft: "auto" }}
        >
          CSV 내보내기
        </button>
      </div>
      <table className={styles.tasks}>
        <thead>
          <tr>
            <th>코드</th>
            <th>제목</th>
            <th>상태</th>
            <th>우선순위</th>
            <th>담당자</th>
            <th>마감일</th>
            <th>진행률</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ textAlign: "center", color: "var(--text-4)", padding: 16 }}>
                표시할 업무가 없습니다.
              </td>
            </tr>
          ) : (
            tasks.map((t) => (
              <tr key={t.id}>
                <td className={styles.tableCode}>{t.code}</td>
                <td className={styles.tableTitle}>{t.title}</td>
                <td>
                  <Tag tone={STATUS_TONE[t.status]} dot>
                    {taskStatusLabel[t.status]}
                  </Tag>
                </td>
                <td>
                  <Tag tone={PRIO_TONE[t.priority]}>{taskPriorityLabel[t.priority]}</Tag>
                </td>
                <td>
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
                </td>
                <td>{t.dueLabel}</td>
                <td>
                  <div className={styles.progressCell}>
                    <ProgressBar value={t.progress} className={styles.progressBar} />
                    <span className={styles.progressVal}>{t.progress}%</span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
