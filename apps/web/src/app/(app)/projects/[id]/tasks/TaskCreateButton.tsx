"use client";

import { useState } from "react";
import type { TaskStatus, User } from "@hanmir/shared";
import { TaskCreateModal } from "./TaskCreateModal";

interface TaskCreateButtonProps {
  projectId: string;
  users: User[];
  defaultStatus?: TaskStatus;
  label?: string;
  className?: string;
}

export function TaskCreateButton({
  projectId,
  users,
  defaultStatus,
  label = "+ 업무 추가",
  className = "btn btn--primary btn--sm"
}: TaskCreateButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <TaskCreateModal
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        users={users}
        defaultStatus={defaultStatus}
      />
    </>
  );
}
