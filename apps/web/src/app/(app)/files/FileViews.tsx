"use client";

import type { FileEntry, User } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { FavoriteIcon } from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { cn } from "@/lib/classNames";
import styles from "./files.module.css";

export const fileColor: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};

export const fileTag: Record<string, string> = {
  pdf: "PDF", xls: "XLS", doc: "DOC", ppt: "PPT", img: "IMG", zip: "ZIP"
};

export function ScopeBtn({
  icon,
  swatch,
  swatchColor,
  label,
  count,
  active,
  onClick
}: {
  icon?: JSX.Element;
  swatch?: boolean;
  swatchColor?: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(styles.scopeItem, active && styles.scopeActive)}
    >
      {swatch ? (
        <span className={styles.scopeSw} style={{ background: swatchColor }} />
      ) : (
        icon
      )}
      {label}
      <span className={styles.count}>{count}</span>
    </button>
  );
}

export function FilterSelect({
  label,
  value,
  render
}: {
  label: string;
  value: string;
  render: () => JSX.Element;
}) {
  return (
    <div className={styles.filterSlot}>
      <span className={styles.filterLabel}>
        {label}: <b>{value}</b>
      </span>
      {render()}
    </div>
  );
}

export function ListTable({
  files,
  userById,
  detail
}: {
  files: FileEntry[];
  userById: Map<string, User>;
  detail: boolean;
}) {
  return (
    <div className={styles.ftable}>
      <table>
        <thead>
          <tr>
            <th className={styles.colIc} />
            <th>이름</th>
            <th className={styles.colTag}>분류</th>
            <th className={styles.colSz}>크기</th>
            <th className={styles.colBy}>업로드</th>
            <th className={styles.colDt}>날짜</th>
            {detail ? <th>설명</th> : null}
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const uploader = userById.get(f.uploaderId);
            return (
              <tr key={f.id}>
                <td>
                  <div className={cn(styles.fic, fileColor[f.kind])}>{fileTag[f.kind]}</div>
                </td>
                <td>
                  <a
                    className={styles.fname}
                    href={fileService.downloadUrl(f.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {f.name}
                    {f.starred ? <FavoriteIcon size={12} /> : null}
                  </a>
                </td>
                <td>
                  <Tag tone={(f.scopeTone as "blue") ?? "default"}>{f.scope}</Tag>
                  {f.scopeExtra ? (
                    <Tag tone={(f.scopeExtra.tone as "amber") ?? "default"}>
                      {f.scopeExtra.label}
                    </Tag>
                  ) : null}
                </td>
                <td className="muted">{f.size}</td>
                <td>
                  {uploader ? (
                    <div className={styles.byRow}>
                      <Avatar
                        initials={uploader.initials}
                        tone={uploader.avatarTone ?? "default"}
                        className={styles.byAvatar}
                      />
                      <span>
                        {uploader.name} {uploader.position}
                      </span>
                    </div>
                  ) : null}
                </td>
                <td className="muted">{f.uploadedAt}</td>
                {detail ? (
                  <td className="muted t-xs">
                    {f.projectId ? `프로젝트: ${f.projectId}` : "—"}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CardView({
  files,
  userById
}: {
  files: FileEntry[];
  userById: Map<string, User>;
}) {
  return (
    <div className={styles.cardGrid}>
      {files.map((f) => {
        const uploader = userById.get(f.uploaderId);
        return (
          <a
            key={f.id}
            className={styles.cardItem}
            href={fileService.downloadUrl(f.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className={cn(styles.fic, fileColor[f.kind], styles.cardIc)}>
              {fileTag[f.kind]}
            </div>
            <div className={styles.cardName}>{f.name}</div>
            <div className={styles.cardMeta}>
              <Tag tone={(f.scopeTone as "blue") ?? "default"}>{f.scope}</Tag>
              <span className="muted">{f.size}</span>
            </div>
            <div className={styles.cardFoot}>
              {uploader ? (
                <>
                  <Avatar
                    initials={uploader.initials}
                    tone={uploader.avatarTone ?? "default"}
                    size="sm"
                  />
                  <span>{uploader.name}</span>
                </>
              ) : null}
              <span className={styles.cardDate}>{f.uploadedAt}</span>
            </div>
          </a>
        );
      })}
    </div>
  );
}
