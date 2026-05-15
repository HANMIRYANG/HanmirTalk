import type { ReactNode } from "react";
import { cn } from "@/lib/classNames";

export type TagTone = "default" | "blue" | "green" | "amber" | "red" | "orange";

interface TagProps {
  tone?: TagTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const toneClass: Record<TagTone, string> = {
  default: "",
  blue: "tag--blue",
  green: "tag--green",
  amber: "tag--amber",
  red: "tag--red",
  orange: "tag--orange"
};

export function Tag({ tone = "default", dot = false, children, className }: TagProps) {
  return (
    <span className={cn("tag", toneClass[tone], dot && "tag--dot", className)}>{children}</span>
  );
}
