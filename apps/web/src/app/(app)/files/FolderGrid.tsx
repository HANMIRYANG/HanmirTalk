"use client";

import type { FileFolder } from "@hanmir/shared";
import { cn } from "@/lib/classNames";
import styles from "./files.module.css";

const FOLDER_TONES = [
  styles.folderYellow,
  styles.folderBlue,
  styles.folderOrange,
  styles.folderPurple
];

interface FolderGridProps {
  folders: FileFolder[];
  isAdmin: boolean;
  isRootLevel: boolean;
  onOpen: (folder: FileFolder) => void;
  onManageMembers?: (folder: FileFolder) => void;
  onDelete?: (folder: FileFolder) => void;
}

// 폴더 카드 그리드 — 루트(부서) 폴더와 하위 폴더 공용.
// 잠금(🔒)은 비밀번호 설정 폴더 표시.
export function FolderGrid({
  folders,
  isAdmin,
  isRootLevel,
  onOpen,
  onManageMembers,
  onDelete
}: FolderGridProps) {
  return (
    <div className={styles.folderGrid}>
      {folders.map((f, i) => {
        const empty = f.fileCount === 0 && f.childCount === 0;
        return (
          <div
            key={f.id}
            className={cn(styles.folder, styles.folderClickable)}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(f);
              }
            }}
          >
            <div className={styles.folderHead}>
              <div className={cn(styles.folderIc, FOLDER_TONES[i % FOLDER_TONES.length])} />
              {isAdmin ? (
                <div className={styles.folderActions}>
                  {isRootLevel && onManageMembers ? (
                    <button
                      type="button"
                      className={styles.folderActionBtn}
                      title="참여자 관리"
                      onClick={(e) => {
                        e.stopPropagation();
                        onManageMembers(f);
                      }}
                    >
                      👥
                    </button>
                  ) : null}
                  {onDelete && empty ? (
                    <button
                      type="button"
                      className={styles.folderActionBtn}
                      title="폴더 삭제 (빈 폴더만)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(f);
                      }}
                    >
                      🗑
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div>
              <div className={styles.folderName}>
                {f.hasPassword ? "🔒 " : ""}
                {f.name}
              </div>
              <div className={styles.folderMeta}>
                파일 {f.fileCount} · 폴더 {f.childCount}
                {isRootLevel && f.memberIds.length > 0
                  ? ` · 참여자 ${f.memberIds.length}명`
                  : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
