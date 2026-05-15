import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ChevronDownIcon, SearchIcon } from "@/components/ui/icons";
import { projectService } from "@/services/project.service";
import { taskService } from "@/services/task.service";
import { userService } from "@/services/user.service";
import { getServerToken } from "@/lib/server-auth";
import { taskPriorityLabel, taskStatusLabel, type TaskItem, type User } from "@hanmir/shared";
import { cn } from "@/lib/classNames";
import styles from "./tasks.module.css";

interface Props {
  params: { id: string };
}

const PRIO_TONE: Record<string, "red" | "amber" | "default"> = {
  top: "red",
  high: "amber",
  normal: "default",
  low: "default"
};

const STATUS_TONE: Record<string, "blue" | "amber" | "red" | "default" | "green"> = {
  todo: "default",
  in_progress: "blue",
  review: "amber",
  done: "green",
  on_hold: "amber"
};

export default async function ProjectTasksPage({ params }: Props) {
  const token = getServerToken();
  const project = await projectService.getProject(params.id, { token });
  if (!project) notFound();

  const [tasks, users] = await Promise.all([
    taskService.listByProject(params.id, { token }),
    userService.listUsers({ token })
  ]);
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const delayed = tasks.filter((t) => t.dueState === "late");
  const inProgress = tasks.filter((t) => t.status === "in_progress" && t.dueState !== "late");
  const todo = tasks.filter((t) => t.status === "todo");

  return (
    <>
      <Topbar title="프로젝트" sub={`${project.code} ${project.name}`} />
      <ProjectHeader
        project={project}
        activeTab="tasks"
        rightActions={
          <>
            <button className="btn btn--outline btn--sm" type="button">
              CSV 내보내기
            </button>
            <button className="btn btn--primary btn--sm" type="button">
              + 업무 추가
            </button>
          </>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.seg}>
          <button className={cn(styles.segBtn, styles.segActive)} type="button">
            목록
          </button>
          <button className={styles.segBtn} type="button">
            보드
          </button>
          <button className={styles.segBtn} type="button">
            타임라인
          </button>
          <button className={styles.segBtn} type="button">
            표
          </button>
        </div>
        <FilterBtn label="담당자" value="전체" />
        <FilterBtn label="상태" value="완료 제외" />
        <FilterBtn label="우선순위" value="전체" />
        <FilterBtn label="정렬" value="마감일순" />
        <div className={styles.right}>
          <div className="search" style={{ width: 220 }}>
            <SearchIcon size={14} />
            <input placeholder="업무 검색" />
          </div>
        </div>
      </div>

      <div className="content no-pad">
        <div className={styles.tblWrap}>
          <TaskGroup
            label="지연 업무"
            count={delayed.length}
            accent="danger"
            tasks={delayed}
            userById={userById}
            showThead
          />
          <TaskGroup
            label="진행중"
            count={inProgress.length}
            tasks={inProgress}
            userById={userById}
          />
          <TaskGroup label="대기" count={todo.length} tasks={todo} userById={userById} />

          <div className={styles.groupHead} style={{ borderTop: "1px solid var(--border-soft)" }}>
            <ChevronDownIcon size={12} />
            <div className={styles.groupLabel}>
              완료
              <span className={cn(styles.groupCount, styles.groupCountSuccess)}>
                {project.taskCounts.done}
              </span>
            </div>
            <span className="muted t-xs" style={{ marginLeft: "auto", marginRight: 8 }}>
              접힌 그룹
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function FilterBtn({ label, value }: { label: string; value: string }) {
  return (
    <button className={styles.filterBtn} type="button">
      {label}: <b>{value}</b>
      <ChevronDownIcon size={10} />
    </button>
  );
}

function TaskGroup({
  label,
  count,
  accent,
  tasks,
  userById,
  showThead
}: {
  label: string;
  count: number;
  accent?: "danger";
  tasks: TaskItem[];
  userById: Map<string, User>;
  showThead?: boolean;
}) {
  return (
    <>
      <div className={styles.groupHead}>
        <ChevronDownIcon size={12} />
        <div className={styles.groupLabel}>
          {label}
          <span
            className={cn(styles.groupCount, accent === "danger" && styles.groupCountDanger)}
          >
            {count}
          </span>
        </div>
        <button className={styles.groupAdd} type="button">
          + 업무 추가
        </button>
      </div>
      <table className={styles.tasks}>
        <colgroup>
          <col className={styles.colCheck} />
          <col />
          <col className={styles.colStatus} />
          <col className={styles.colAssign} />
          <col className={styles.colDue} />
          <col className={styles.colProgress} />
          <col className={styles.colPriority} />
        </colgroup>
        {showThead ? (
          <thead>
            <tr>
              <th />
              <th>업무명</th>
              <th>상태</th>
              <th>담당자</th>
              <th>마감일</th>
              <th>진행률</th>
              <th>우선순위</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <span
                  className={cn(
                    styles.check,
                    t.status === "in_progress" && styles.checkProgress,
                    t.status === "done" && styles.checkDone
                  )}
                />
              </td>
              <td>
                <div className={styles.title}>
                  {t.title}
                  <span className={styles.id}>{t.code}</span>
                  {t.subtaskCount ? (
                    <span className={styles.subs}>↳ 하위 {t.subtaskCount}</span>
                  ) : null}
                </div>
              </td>
              <td>
                <Tag tone={STATUS_TONE[t.status]} dot>
                  {t.dueState === "late" ? "지연" : taskStatusLabel[t.status]}
                </Tag>
              </td>
              <td>
                {t.assigneeIds.length > 0 ? (
                  <div className={styles.assignees}>
                    {t.assigneeIds.map((id) => {
                      const u = userById.get(id);
                      return u ? (
                        <Avatar
                          key={id}
                          initials={u.initials}
                          tone={u.avatarTone ?? "default"}
                          className={styles.assigneeAvatar}
                        />
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div className={styles.assignees}>
                    <Avatar initials="미지정" tone="gray" className={styles.assigneeAvatar} />
                  </div>
                )}
              </td>
              <td>
                <span
                  className={cn(
                    styles.due,
                    t.dueState === "late" && styles.dueLate,
                    t.dueState === "today" && styles.dueToday
                  )}
                >
                  {t.dueLabel}
                </span>
              </td>
              <td>
                <div className={styles.progressCell}>
                  <ProgressBar
                    value={t.progress}
                    tone={t.dueState === "late" ? "orange" : "blue"}
                    className={styles.progressBar}
                  />
                  <span className={styles.progressVal}>{t.progress}%</span>
                </div>
              </td>
              <td>
                <Tag tone={PRIO_TONE[t.priority]}>{taskPriorityLabel[t.priority]}</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
