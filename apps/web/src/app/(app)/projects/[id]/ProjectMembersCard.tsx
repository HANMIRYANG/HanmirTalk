"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, User } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { Modal } from "@/components/ui/Modal";
import { SearchIcon } from "@/components/ui/icons";
import { projectService } from "@/services/project.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./detail.module.css";
import mstyles from "./members.module.css";

interface ProjectMembersCardProps {
  project: Project;
  users: User[];
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "프로젝트를 찾을 수 없습니다.";
    if (err.status === 400 && err.message === "user_not_found")
      return "사용자를 찾을 수 없습니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다.";
}

export function ProjectMembersCard({ project, users }: ProjectMembersCardProps) {
  const router = useRouter();
  const [memberIds, setMemberIds] = useState<string[]>(project.memberIds);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);
  const memberSet = useMemo(() => new Set(memberIds), [memberIds]);

  const ownerFirstName = project.ownerName?.split(" ")[0] ?? "";

  const addable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (memberSet.has(u.id)) return false;
      if (u.isActive === false) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.departmentName.toLowerCase().includes(q) ||
        u.position.toLowerCase().includes(q)
      );
    });
  }, [users, memberSet, search]);

  const onAdd = async (userId: string) => {
    if (busyUserId) return;
    setBusyUserId(userId);
    try {
      const updated = await projectService.addProjectMember(project.id, userId);
      setMemberIds(updated.memberIds);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const onRemove = async (userId: string) => {
    if (busyUserId) return;
    const u = userById.get(userId);
    if (!window.confirm(`'${u?.name ?? userId}' 멤버를 프로젝트에서 제외하시겠습니까?`)) return;
    setBusyUserId(userId);
    try {
      const updated = await projectService.removeProjectMember(project.id, userId);
      setMemberIds(updated.memberIds);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      window.alert(describeError(err));
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <section className="card">
      <div className="card__head">
        <h3>멤버 {memberIds.length}명</h3>
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginLeft: "auto" }}
          type="button"
          onClick={() => {
            setSearch("");
            setAddOpen(true);
          }}
        >
          + 초대
        </button>
      </div>
      <div className={styles.memberBody}>
        {memberIds.length === 0 ? (
          <div className={mstyles.empty}>등록된 멤버가 없습니다.</div>
        ) : (
          memberIds.map((id) => {
            const u = userById.get(id);
            if (!u) {
              return (
                <div key={id} className={styles.memberRow}>
                  <Avatar initials="?" tone="gray" />
                  <div>
                    <div className={styles.memberName}>알 수 없음</div>
                    <div className={styles.memberRole}>{id}</div>
                  </div>
                  <button
                    type="button"
                    className={mstyles.removeBtn}
                    onClick={() => onRemove(id)}
                    disabled={busyUserId === id}
                    aria-label="멤버 제외"
                  >
                    {busyUserId === id ? "..." : "제외"}
                  </button>
                </div>
              );
            }
            const isOwner = ownerFirstName !== "" && u.name === ownerFirstName;
            return (
              <div key={id} className={styles.memberRow}>
                <Avatar initials={u.initials} tone={u.avatarTone ?? "default"} />
                <div className={mstyles.memberInfo}>
                  <div className={styles.memberName}>{u.name}</div>
                  <div className={styles.memberRole}>
                    {u.position} · {u.departmentName}
                  </div>
                </div>
                {isOwner ? (
                  <Tag tone="orange" className={mstyles.ownerTag}>
                    담당자
                  </Tag>
                ) : null}
                <button
                  type="button"
                  className={mstyles.removeBtn}
                  onClick={() => onRemove(id)}
                  disabled={busyUserId === id}
                  aria-label="멤버 제외"
                  title="제외"
                >
                  {busyUserId === id ? "..." : "제외"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={addOpen}
        onClose={() => (busyUserId ? null : setAddOpen(false))}
        title="멤버 초대"
        description={`현재 멤버 ${memberIds.length}명`}
        width={520}
        footer={
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => setAddOpen(false)}
            disabled={busyUserId !== null}
          >
            닫기
          </button>
        }
      >
        <div className={mstyles.addBody}>
          <div className="search" style={{ width: "100%" }}>
            <SearchIcon size={14} />
            <input
              placeholder="이름·부서·직책 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className={mstyles.addList}>
            {addable.length === 0 ? (
              <div className={mstyles.empty}>추가할 사용자가 없습니다.</div>
            ) : (
              addable.map((u) => (
                <div key={u.id} className={mstyles.addRow}>
                  <Avatar initials={u.initials} tone={u.avatarTone ?? "default"} size="sm" />
                  <div className={mstyles.addInfo}>
                    <div className={mstyles.addName}>{u.name}</div>
                    <div className={mstyles.addMeta}>
                      {u.departmentName} · {u.position}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => onAdd(u.id)}
                    disabled={busyUserId !== null}
                  >
                    {busyUserId === u.id ? "추가 중..." : "추가"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
}
