import { cn } from "@/lib/classNames";

interface ProgressBarProps {
  value: number;
  tone?: "blue" | "orange" | "green";
  className?: string;
}

export function ProgressBar({ value, tone = "blue", className }: ProgressBarProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "progress",
        tone === "orange" && "progress--orange",
        tone === "green" && "progress--green",
        className
      )}
    >
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}
