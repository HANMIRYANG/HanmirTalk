import { cn } from "@/lib/classNames";

type Tone = "default" | "orange" | "green" | "purple" | "gray";

interface AvatarProps {
  initials: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const toneClass: Record<Tone, string> = {
  default: "",
  orange: "avatar--orange",
  green: "avatar--green",
  purple: "avatar--purple",
  gray: "avatar--gray"
};

export function Avatar({ initials, tone = "default", size = "md", className }: AvatarProps) {
  return (
    <div
      className={cn(
        "avatar",
        size === "sm" && "sm",
        size === "lg" && "lg",
        toneClass[tone],
        className
      )}
    >
      {initials}
    </div>
  );
}
