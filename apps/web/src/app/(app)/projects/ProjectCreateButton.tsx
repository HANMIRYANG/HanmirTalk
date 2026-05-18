"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectFormModal } from "./ProjectFormModal";

interface ProjectCreateButtonProps {
  label?: string;
  className?: string;
}

export function ProjectCreateButton({
  label = "+ 프로젝트 추가",
  className = "btn btn--primary btn--sm"
}: ProjectCreateButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ProjectFormModal
        open={open}
        mode={{ kind: "create" }}
        onClose={() => setOpen(false)}
        onSubmitted={(p) => router.push(`/projects/${p.id}`)}
      />
    </>
  );
}
