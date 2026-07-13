"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type {
  ChatMessage,
  FileEntry,
  Product,
  Project,
  ProjectStatus,
  SalesStatus,
  SearchMatch,
  SearchResults,
  TaskItem,
  TaskStatus
} from "@hanmir/shared";
import { projectStatusLabel, salesStatusLabel, taskStatusLabel } from "@hanmir/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Tag } from "@/components/ui/Tag";
import { fileService } from "@/services/file.service";
import { cn } from "@/lib/classNames";
import styles from "./search.module.css";

type Tab = "all" | "messages" | "files" | "projects" | "products" | "tasks";

interface Props {
  results: SearchResults;
  roomNames: Record<string, string>;
}

// Phase 9 — 통합 검색 결과 (탭 전환). "전체" 탭은 도메인별 최대 5건 미리보기.
const PREVIEW = 5;

const PROJECT_TONE: Record<ProjectStatus, "blue" | "green" | "amber" | "red" | "default"> = {
  ready: "default",
  in_progress: "blue",
  review: "amber",
  on_hold: "amber",
  done: "green",
  cancelled: "red"
};
const SALES_TONE: Record<SalesStatus, "blue" | "green" | "amber" | "red" | "default"> = {
  unavailable: "red",
  preparing: "amber",
  internal: "blue",
  conditional: "amber",
  available: "green"
};

export function SearchResultsView({ results, roomNames }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const { messages, files, projects, products, query } = results;
  // 구버전 서버 응답(tasks 필드 없음)과의 호환.
  const tasks = results.tasks ?? [];

  const counts = {
    messages: messages.length,
    files: files.length,
    projects: projects.length,
    products: products.length,
    tasks: tasks.length
  };
  const total =
    counts.messages + counts.files + counts.projects + counts.products + counts.tasks;

  if (total === 0) {
    return (
      <div className={styles.empty}>
        &ldquo;{query}&rdquo;와(과) 일치하는 결과가 없습니다.
      </div>
    );
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "전체", count: total },
    { key: "messages", label: "메시지", count: counts.messages },
    { key: "files", label: "파일", count: counts.files },
    { key: "projects", label: "프로젝트", count: counts.projects },
    { key: "tasks", label: "업무", count: counts.tasks },
    { key: "products", label: "제품", count: counts.products }
  ];

  const show = (domain: Tab) => tab === "all" || tab === domain;
  const limit = <T,>(list: T[]): T[] => (tab === "all" ? list.slice(0, PREVIEW) : list);

  return (
    <>
      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={cn(styles.tab, tab === t.key && styles.tabActive)}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className={styles.count}>{t.count}</span>
          </button>
        ))}
      </nav>

      {show("messages") && counts.messages > 0 ? (
        <Section
          title="메시지"
          fullCount={counts.messages}
          shown={limit(messages).length}
          onMore={tab === "all" ? () => setTab("messages") : undefined}
        >
          {limit(messages).map((m) => (
            <MessageHit
              key={m.id}
              m={m}
              roomName={roomNames[m.roomId]}
              query={query}
            />
          ))}
        </Section>
      ) : null}

      {show("files") && counts.files > 0 ? (
        <Section
          title="파일"
          fullCount={counts.files}
          shown={limit(files).length}
          onMore={tab === "all" ? () => setTab("files") : undefined}
        >
          {limit(files).map((f) => (
            <FileHit key={f.id} f={f} />
          ))}
        </Section>
      ) : null}

      {show("projects") && counts.projects > 0 ? (
        <Section
          title="프로젝트"
          fullCount={counts.projects}
          shown={limit(projects).length}
          onMore={tab === "all" ? () => setTab("projects") : undefined}
        >
          {limit(projects).map((p) => (
            <ProjectHit key={p.id} p={p} query={query} />
          ))}
        </Section>
      ) : null}

      {show("tasks") && counts.tasks > 0 ? (
        <Section
          title="업무"
          fullCount={counts.tasks}
          shown={limit(tasks).length}
          onMore={tab === "all" ? () => setTab("tasks") : undefined}
        >
          {limit(tasks).map((t) => (
            <TaskHit key={t.id} t={t} query={query} />
          ))}
        </Section>
      ) : null}

      {show("products") && counts.products > 0 ? (
        <Section
          title="제품"
          fullCount={counts.products}
          shown={limit(products).length}
          onMore={tab === "all" ? () => setTab("products") : undefined}
        >
          {limit(products).map((p) => (
            <ProductHit key={p.id} p={p} query={query} />
          ))}
        </Section>
      ) : null}

      {tab !== "all" && counts[tab] === 0 ? (
        <div className={styles.empty}>이 분류에는 결과가 없습니다.</div>
      ) : null}
    </>
  );
}

function Section({
  title,
  fullCount,
  shown,
  onMore,
  children
}: {
  title: string;
  fullCount: number;
  shown: number;
  onMore?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>
          {title} <span className={styles.count}>{fullCount}</span>
        </h3>
        {onMore && fullCount > shown ? (
          <button type="button" className={styles.moreBtn} onClick={onMore}>
            전체 {fullCount}건 보기 →
          </button>
        ) : null}
      </div>
      <ul className={styles.list}>{children}</ul>
    </section>
  );
}

function MessageHit({
  m,
  roomName,
  query
}: {
  m: ChatMessage;
  roomName?: string;
  query: string;
}) {
  return (
    <li className={styles.item}>
      <Link href={`/chat/${m.roomId}`} className={styles.link}>
        <div className={styles.itemHead}>
          <Avatar initials={m.initials} tone={m.avatarTone ?? "default"} size="sm" />
          <div className={styles.itemMeta}>
            <div className={styles.itemAuthor}>
              {m.authorName}
              {m.authorRole ? (
                <span className={styles.itemRole}>· {m.authorRole}</span>
              ) : null}
            </div>
            <div className={styles.itemRoom}>
              {roomName ? `# ${roomName}` : "(알 수 없는 방)"} ·{" "}
              {formatStamp(m.createdAt)}
              {m.editedAt ? " · (수정됨)" : ""}
            </div>
          </div>
        </div>
        <div className={styles.itemBody}>{highlight(m.body, query)}</div>
      </Link>
    </li>
  );
}

function FileHit({ f }: { f: FileEntry }) {
  return (
    <li className={styles.item}>
      <a href={fileService.downloadUrl(f.id)} className={cn(styles.link, styles.hit)}>
        <span className={styles.fileBadge}>{f.kind.toUpperCase()}</span>
        <span className={styles.hitMain}>
          <span className={styles.hitTitle}>{f.name}</span>
          <span className={styles.hitMeta}>
            {f.scope} · {f.size} · {f.uploadedAt}
          </span>
        </span>
      </a>
    </li>
  );
}

// 매칭이 제목이 아닌 필드(설명 등)에서 났을 때 그 근거를 보여주는 스니펫 줄.
function MatchSnippet({ hit, query }: { hit: SearchMatch; query: string }) {
  if (!hit.snippet) return null;
  return <span className={styles.hitSnippet}>{highlight(hit.snippet, query)}</span>;
}

function ProjectHit({ p, query }: { p: Project & SearchMatch; query: string }) {
  return (
    <li className={styles.item}>
      <Link href={`/projects/${p.id}`} className={cn(styles.link, styles.hit)}>
        <span className={styles.hitMain}>
          <span className={styles.hitTitle}>
            {highlight(`${p.code ? `${p.code} ` : ""}${p.name}`, query)}
          </span>
          <MatchSnippet hit={p} query={query} />
          <span className={styles.hitMeta}>
            <Tag tone={PROJECT_TONE[p.status] ?? "default"} dot>
              {p.stageLabel || projectStatusLabel[p.status]}
            </Tag>
            진행률 {p.progress}%{p.dueDate ? ` · 마감 ${p.dueDate}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

const TASK_TONE: Record<TaskStatus, "blue" | "green" | "amber" | "red" | "default"> = {
  todo: "default",
  in_progress: "blue",
  review: "amber",
  done: "green",
  on_hold: "amber"
};

function TaskHit({
  t,
  query
}: {
  t: TaskItem & SearchMatch & { projectName?: string };
  query: string;
}) {
  return (
    <li className={styles.item}>
      <Link
        href={`/projects/${t.projectId}/tasks`}
        className={cn(styles.link, styles.hit)}
      >
        <span className={styles.hitMain}>
          <span className={styles.hitTitle}>{highlight(t.title, query)}</span>
          <MatchSnippet hit={t} query={query} />
          <span className={styles.hitMeta}>
            <Tag tone={TASK_TONE[t.status] ?? "default"} dot>
              {taskStatusLabel[t.status]}
            </Tag>
            {t.projectName ? `${t.projectName} · ` : ""}
            {t.code}
            {t.dueDate ? ` · 마감 ${t.dueDate}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

function ProductHit({ p, query }: { p: Product & SearchMatch; query: string }) {
  return (
    <li className={styles.item}>
      <Link href={`/products/${p.id}`} className={cn(styles.link, styles.hit)}>
        <span className={styles.hitMain}>
          <span className={styles.hitTitle}>{highlight(p.fullName || p.name, query)}</span>
          <MatchSnippet hit={p} query={query} />
          <span className={styles.hitMeta}>
            <Tag tone={SALES_TONE[p.salesStatus] ?? "default"} dot>
              {salesStatusLabel[p.salesStatus]}
            </Tag>
            {p.category}
          </span>
        </span>
      </Link>
    </li>
  );
}

function formatStamp(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

// 매칭 substring 인라인 하이라이트 (대소문자 무시 단일 패스).
function highlight(body: string, needle: string): ReactNode {
  if (!needle) return body;
  const lower = body.toLowerCase();
  const n = needle.toLowerCase();
  const out: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < body.length) {
    const idx = lower.indexOf(n, cursor);
    if (idx === -1) {
      out.push(body.slice(cursor));
      break;
    }
    if (idx > cursor) out.push(body.slice(cursor, idx));
    out.push(
      <mark key={key++} className={styles.mark}>
        {body.slice(idx, idx + needle.length)}
      </mark>
    );
    cursor = idx + needle.length;
  }
  return out;
}
