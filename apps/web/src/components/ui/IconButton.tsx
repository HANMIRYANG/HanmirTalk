"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/classNames";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function IconButton({ children, className, ...rest }: IconButtonProps) {
  return (
    <button type="button" className={cn("icon-btn", className)} {...rest}>
      {children}
    </button>
  );
}
