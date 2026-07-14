"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@hanmir/shared";
import { projectService } from "@/services/project.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { confirmDialog, alertDialog } from "@/components/ui/AppDialogHost";
import { ProjectFormModal } from "@/app/(app)/projects/ProjectFormModal";

interface ProjectActionsProps {
  project: Project;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "이미 삭제된 프로젝트입니다.";
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다.";
}

export function ProjectActions({ project }: ProjectActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const cancelled = project.status === "cancelled";

  const onCancel = async () => {
    if (busy || cancelled) return;
    if (
      !(await confirmDialog(
        `'${project.name}' 프로젝트를 취소(중단) 처리하시겠습니까?\n관련 업무와 메시지는 그대로 보존됩니다.`,
        { danger: true }
      ))
    ) {
      return;
    }
    setBusy(true);
    try {
      await projectService.deleteProject(project.id);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      alertDialog(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={() => setEditOpen(true)}
        disabled={busy}
      >
        수정
      </button>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        onClick={onCancel}
        disabled={busy || cancelled}
        title={cancelled ? "이미 취소된 프로젝트입니다." : undefined}
      >
        {busy ? "처리 중..." : cancelled ? "취소됨" : "프로젝트 취소"}
      </button>
      <ProjectFormModal
        open={editOpen}
        mode={{ kind: "edit", project }}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
