"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreateDepartmentInput,
  Department,
  UpdateDepartmentInput
} from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { departmentService } from "@/services/department.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import fstyles from "./admin-forms.module.css";

interface DepartmentsAdminCardProps {
  initialDepartments: Department[];
}

function describeError(err: unknown, context: "delete" | "save"): string {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.message === "department_in_use") {
      return "사용 중인 부서는 삭제할 수 없습니다. 먼저 소속 사용자를 다른 부서로 이동하세요.";
    }
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "이미 삭제된 부서입니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return context === "delete"
    ? "부서 삭제에 실패했습니다."
    : "부서 저장에 실패했습니다.";
}

export function DepartmentsAdminCard({ initialDepartments }: DepartmentsAdminCardProps) {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Department | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("부서명은 필수입니다.");
      return;
    }
    setCreating(true);
    try {
      const payload: CreateDepartmentInput = {
        name: newName.trim(),
        description: newDescription.trim() || undefined
      };
      const dept = await departmentService.createDepartment(payload);
      setDepartments((prev) => [...prev, dept]);
      setNewName("");
      setNewDescription("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setCreateError(describeError(err, "save"));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setEditName(dept.name);
    setEditDescription(dept.description ?? "");
    setEditError(null);
  };

  const closeEdit = () => {
    if (editSubmitting) return;
    setEditing(null);
    setEditError(null);
  };

  const onEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setEditError(null);
    if (!editName.trim()) {
      setEditError("부서명은 필수입니다.");
      return;
    }
    setEditSubmitting(true);
    try {
      const payload: UpdateDepartmentInput = {
        name: editName.trim(),
        description: editDescription.trim() || undefined
      };
      const updated = await departmentService.updateDepartment(editing.id, payload);
      setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setEditError(describeError(err, "save"));
    } finally {
      setEditSubmitting(false);
    }
  };

  const onDelete = async (dept: Department) => {
    if (busyId) return;
    const confirmed = window.confirm(`'${dept.name}' 부서를 삭제할까요?`);
    if (!confirmed) return;
    setBusyId(dept.id);
    setRowError(null);
    try {
      await departmentService.deleteDepartment(dept.id);
      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setRowError(describeError(err, "delete"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={`card ${fstyles.fullCard}`}>
      <div className="card__head">
        <h3>부서 관리</h3>
        <span className="muted t-xs">{departments.length}개 부서</span>
      </div>

      <form className={fstyles.inlineCreate} onSubmit={onCreate}>
        <label>
          새 부서명
          <input
            className="field"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 신소재 R&D팀"
            required
          />
        </label>
        <label>
          설명 (선택)
          <input
            className="field"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="부서에 대한 짧은 설명"
          />
        </label>
        <button className="btn btn--primary btn--sm" type="submit" disabled={creating}>
          {creating ? "추가 중..." : "+ 부서 추가"}
        </button>
        {createError ? (
          <div
            className={fstyles.formError}
            role="alert"
            style={{ gridColumn: "1 / -1", marginTop: 4 }}
          >
            {createError}
          </div>
        ) : null}
      </form>

      {rowError ? (
        <div className={fstyles.formError} role="alert" style={{ margin: "10px 18px 0" }}>
          {rowError}
        </div>
      ) : null}

      <div>
        {departments.length === 0 ? (
          <div className="muted" style={{ padding: 20, textAlign: "center", fontSize: 13 }}>
            등록된 부서가 없습니다. 위 양식으로 첫 부서를 추가하세요.
          </div>
        ) : (
          departments.map((d) => (
            <div key={d.id} className={fstyles.deptRowInteractive}>
              <div>
                <div className={fstyles.deptName}>{d.name}</div>
                <div className={fstyles.deptDesc}>
                  {d.description?.trim() || "(설명 없음)"}
                </div>
              </div>
              <div className="muted t-xs">{d.id}</div>
              <div className={fstyles.deptActions}>
                <button
                  type="button"
                  className={fstyles.linkBtn}
                  onClick={() => openEdit(d)}
                  disabled={busyId === d.id}
                >
                  수정
                </button>
                <button
                  type="button"
                  className={`${fstyles.linkBtn} ${fstyles.danger}`}
                  onClick={() => onDelete(d)}
                  disabled={busyId === d.id}
                >
                  {busyId === d.id ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={!!editing}
        onClose={closeEdit}
        title="부서 정보 수정"
        description={editing?.name}
        width={460}
        footer={
          <>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={closeEdit}
              disabled={editSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              form="admin-department-form"
              className="btn btn--primary btn--sm"
              disabled={editSubmitting}
            >
              {editSubmitting ? "저장 중..." : "저장"}
            </button>
          </>
        }
      >
        <form id="admin-department-form" onSubmit={onEditSubmit} noValidate>
          <div className={fstyles.formGrid}>
            <label className={fstyles.span2}>
              부서명
              <input
                className="field"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </label>
            <label className={fstyles.span2}>
              설명
              <input
                className="field"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
          </div>
          {editError ? (
            <div className={fstyles.formError} role="alert">
              {editError}
            </div>
          ) : null}
        </form>
      </Modal>
    </section>
  );
}
