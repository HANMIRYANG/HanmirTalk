"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/classNames";
import styles from "./MessageContextMenu.module.css";

export interface ContextMenuItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface MessageContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// 메시지 우클릭 컨텍스트 메뉴 — hover 액션(읽음/업무/결정사항/수정/삭제)
// 과 고정/답글을 한 목록으로 제공한다. 바깥 클릭·Escape·스크롤·리사이즈
// 에 닫힌다.
export function MessageContextMenu({ x, y, items, onClose }: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 뷰포트 밖으로 나가지 않게 렌더 직후 실측해서 위치 보정.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // capture: .msgs 등 내부 스크롤 컨테이너의 스크롤도 감지해 닫는다.
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, { capture: true });
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={cn(styles.item, item.danger && styles.itemDanger)}
          disabled={item.disabled}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
