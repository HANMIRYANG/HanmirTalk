"use client";

import { useMemo, useState } from "react";
import type { FileEntry, FileFolder, FileKind, Project, User } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import {
  CheckIcon,
  ClockIcon,
  FavoriteIcon,
  FolderIcon,
  LockIcon,
  PinIcon,
  SearchIcon
} from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { cn } from "@/lib/classNames";
import { FileUploadButton } from "./FileUploadButton";
import styles from "./files.module.css";

type ScopeKind =
  | "all"
  | "recent"
  | "starred"
  | "mine"
  | "private"
  | { kind: "project"; id: string; name: string }
  | { kind: "dept"; name: string }
  | { kind: "type"; type: FileKind };

type ViewMode = "list" | "card" | "detail";
type TypeFilter = "all" | "doc" | "spreadsheet" | "image" | "zip" | "pdf" | "ppt";
type OwnerFilter = "all" | "me" | string; // user id
type PeriodFilter = "all" | "today" | "week" | "month";
type SortBy = "newest" | "oldest" | "name" | "size";

const fileColor: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};

const fileTag: Record<string, string> = {
  pdf: "PDF", xls: "XLS", doc: "DOC", ppt: "PPT", img: "IMG", zip: "ZIP"
};

const folderTone: Record<string, string> = {
  yellow: styles.folderYellow,
  blue: styles.folderBlue,
  orange: styles.folderOrange,
  purple: styles.folderPurple
};

function isInPeriod(uploadedAt: string, period: PeriodFilter): boolean {
  if (period === "all") return true;
  // uploadedAt formats vary: "오늘 13:18", "어제 17:02", "2026.05.18". Try the
  // friendly Korean prefixes first, then fall back to Date.parse.
  if (uploadedAt.startsWith("오늘")) return true;
  if (period !== "today" && uploadedAt.startsWith("어제")) return true;
  const t = Date.parse(uploadedAt.replace(/\./g, "-"));
  if (Number.isNaN(t)) return false; // unparseable → exclude from time-bounded scopes
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (period === "today") return diff < day;
  if (period === "week") return diff < 7 * day;
  return diff < 30 * day; // month
}

function matchesType(kind: FileKind, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "doc") return kind === "doc" || kind === "pdf";
  if (filter === "spreadsheet") return kind === "xls";
  if (filter === "image") return kind === "img";
  if (filter === "zip") return kind === "zip";
  if (filter === "pdf") return kind === "pdf";
  if (filter === "ppt") return kind === "ppt";
  return true;
}

function uploadedAtMs(uploadedAt: string): number {
  if (uploadedAt.startsWith("오늘")) return Date.now();
  if (uploadedAt.startsWith("어제")) return Date.now() - 86_400_000;
  const t = Date.parse(uploadedAt.replace(/\./g, "-"));
  return Number.isNaN(t) ? 0 : t;
}

interface FileLibraryProps {
  folders: FileFolder[];
  files: FileEntry[];
  users: User[];
  projects: Project[];
  meId: string;
}

export function FileLibrary({ folders, files, users, projects, meId }: FileLibraryProps) {
  const [scope, setScope] = useState<ScopeKind>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [search, setSearch] = useState("");

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const u of users) if (u.departmentName) set.add(u.departmentName);
    return Array.from(set).sort();
  }, [users]);

  // Counts per scope — all from `files` once.
  const counts = useMemo(() => {
    const out = {
      all: files.length,
      recent: files.filter((f) => isInPeriod(f.uploadedAt, "week")).length,
      starred: files.filter((f) => f.starred).length,
      mine: files.filter((f) => f.uploaderId === meId).length,
      private: 0,
      perProject: new Map<string, number>(),
      perDept: new Map<string, number>(),
      perType: { doc: 0, xls: 0, img: 0, zip: 0, pdf: 0, ppt: 0 } as Record<FileKind, number>
    };
    for (const f of files) {
      if (f.projectId) {
        out.perProject.set(f.projectId, (out.perProject.get(f.projectId) ?? 0) + 1);
      }
      const uploader = userById.get(f.uploaderId);
      const dept = uploader?.departmentName;
      if (dept) out.perDept.set(dept, (out.perDept.get(dept) ?? 0) + 1);
      out.perType[f.kind] = (out.perType[f.kind] ?? 0) + 1;
    }
    return out;
  }, [files, userById, meId]);

  const scopedFiles = useMemo(() => {
    if (scope === "all") return files;
    if (scope === "recent") return files.filter((f) => isInPeriod(f.uploadedAt, "week"));
    if (scope === "starred") return files.filter((f) => f.starred);
    if (scope === "mine") return files.filter((f) => f.uploaderId === meId);
    if (scope === "private") return [];
    if (typeof scope === "object" && scope.kind === "project")
      return files.filter((f) => f.projectId === scope.id);
    if (typeof scope === "object" && scope.kind === "dept") {
      return files.filter((f) => userById.get(f.uploaderId)?.departmentName === scope.name);
    }
    if (typeof scope === "object" && scope.kind === "type")
      return files.filter((f) => f.kind === scope.type);
    return files;
  }, [files, scope, meId, userById]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let xs = scopedFiles.filter((f) => {
      if (!matchesType(f.kind, typeFilter)) return false;
      if (ownerFilter === "me" && f.uploaderId !== meId) return false;
      if (ownerFilter !== "all" && ownerFilter !== "me" && f.uploaderId !== ownerFilter)
        return false;
      if (!isInPeriod(f.uploadedAt, periodFilter)) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
    xs = xs.slice().sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") {
        // parse "1.2 MB" → bytes; cheap approximation
        const toBytes = (s: string) => {
          const n = parseFloat(s);
          if (s.includes("GB")) return n * 1e9;
          if (s.includes("MB")) return n * 1e6;
          if (s.includes("KB")) return n * 1e3;
          return n;
        };
        return toBytes(b.size) - toBytes(a.size);
      }
      const dir = sortBy === "oldest" ? 1 : -1;
      return (uploadedAtMs(a.uploadedAt) - uploadedAtMs(b.uploadedAt)) * dir;
    });
    return xs;
  }, [scopedFiles, typeFilter, ownerFilter, periodFilter, sortBy, search, meId]);

  // Scope label for breadcrumb
  const scopeLabel =
    scope === "all"
      ? "전체 파일"
      : scope === "recent"
      ? "최근 항목"
      : scope === "starred"
      ? "즐겨찾기"
      : scope === "mine"
      ? "내가 공유한 항목"
      : scope === "private"
      ? "개인 보관함"
      : scope.kind === "project"
      ? `${scope.name}`
      : scope.kind === "dept"
      ? scope.name
      : `유형: ${fileTag[scope.type] ?? scope.type}`;

  const typeLabel =
    typeFilter === "all"
      ? "전체"
      : typeFilter === "doc"
      ? "문서"
      : typeFilter === "spreadsheet"
      ? "스프레드시트"
      : typeFilter === "image"
      ? "이미지"
      : typeFilter === "zip"
      ? "압축"
      : typeFilter === "pdf"
      ? "PDF"
      : "프레젠테이션";
  const ownerLabel =
    ownerFilter === "all" ? "전체" : ownerFilter === "me" ? "나" : userById.get(ownerFilter)?.name ?? "선택";
  const periodLabel =
    periodFilter === "all"
      ? "전체"
      : periodFilter === "today"
      ? "오늘"
      : periodFilter === "week"
      ? "최근 7일"
      : "최근 30일";
  const sortLabel =
    sortBy === "newest" ? "최신순" : sortBy === "oldest" ? "오래된순" : sortBy === "name" ? "이름순" : "크기순";

  return (
    <div className={styles.layout}>
      <aside className={styles.scope}>
        <div className={styles.scopeTitle}>위치</div>
        <ScopeBtn
          icon={<FolderIcon size={14} />}
          label="전체 파일"
          count={counts.all}
          active={scope === "all"}
          onClick={() => setScope("all")}
        />
        <ScopeBtn
          icon={<ClockIcon size={14} />}
          label="최근 항목"
          count={counts.recent}
          active={scope === "recent"}
          onClick={() => setScope("recent")}
        />
        <ScopeBtn
          icon={<PinIcon size={14} />}
          label="즐겨찾기"
          count={counts.starred}
          active={scope === "starred"}
          onClick={() => setScope("starred")}
        />
        <ScopeBtn
          icon={<CheckIcon size={14} />}
          label="내가 공유한 항목"
          count={counts.mine}
          active={scope === "mine"}
          onClick={() => setScope("mine")}
        />
        <ScopeBtn
          icon={<LockIcon size={14} />}
          label="개인 보관함"
          count={counts.private}
          active={scope === "private"}
          onClick={() => setScope("private")}
        />

        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          프로젝트
        </div>
        {projects.length === 0 ? (
          <div className={styles.scopeEmpty}>프로젝트 없음</div>
        ) : (
          projects.map((p) => (
            <ScopeBtn
              key={p.id}
              swatch
              swatchColor={p.status === "cancelled" ? "#9CA3AF" : "#1F4FA8"}
              label={`${p.code} ${p.name}`}
              count={counts.perProject.get(p.id) ?? 0}
              active={typeof scope === "object" && scope.kind === "project" && scope.id === p.id}
              onClick={() =>
                setScope({ kind: "project", id: p.id, name: `${p.code} ${p.name}` })
              }
            />
          ))
        )}

        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          부서
        </div>
        {departments.length === 0 ? (
          <div className={styles.scopeEmpty}>부서 정보 없음</div>
        ) : (
          departments.map((dept) => (
            <ScopeBtn
              key={dept}
              label={dept}
              count={counts.perDept.get(dept) ?? 0}
              active={typeof scope === "object" && scope.kind === "dept" && scope.name === dept}
              onClick={() => setScope({ kind: "dept", name: dept })}
            />
          ))
        )}

        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          유형
        </div>
        {([
          { t: "doc", emoji: "📄", label: "문서 (Word/PDF)" },
          { t: "xls", emoji: "📊", label: "스프레드시트" },
          { t: "img", emoji: "🖼", label: "이미지" },
          { t: "zip", emoji: "📦", label: "압축파일" }
        ] as const).map(({ t, emoji, label }) => (
          <ScopeBtn
            key={t}
            label={`${emoji} ${label}`}
            count={counts.perType[t as FileKind] ?? 0}
            active={typeof scope === "object" && scope.kind === "type" && scope.type === (t as FileKind)}
            onClick={() => setScope({ kind: "type", type: t as FileKind })}
          />
        ))}
      </aside>

      <main className={styles.main}>
        <section className={styles.bar}>
          <div className={styles.crumb}>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={styles.crumbLink}
            >
              파일함
            </button>
            <span className={styles.sep}>›</span>
            <b>{scopeLabel}</b>
          </div>
          <div className={styles.barRow}>
            <div className={styles.seg}>
              {(["list", "card", "detail"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setView(m)}
                  className={cn(styles.segBtn, view === m && styles.segActive)}
                >
                  {m === "list" ? "목록" : m === "card" ? "카드" : "상세"}
                </button>
              ))}
            </div>
            <FilterSelect
              label="유형"
              value={typeLabel}
              render={() => (
                <select
                  className={styles.nativeSelect}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  aria-label="유형 필터"
                >
                  <option value="all">전체</option>
                  <option value="doc">문서</option>
                  <option value="pdf">PDF</option>
                  <option value="spreadsheet">스프레드시트</option>
                  <option value="image">이미지</option>
                  <option value="ppt">프레젠테이션</option>
                  <option value="zip">압축</option>
                </select>
              )}
            />
            <FilterSelect
              label="소유자"
              value={ownerLabel}
              render={() => (
                <select
                  className={styles.nativeSelect}
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value as OwnerFilter)}
                  aria-label="소유자 필터"
                >
                  <option value="all">전체</option>
                  <option value="me">나</option>
                  <optgroup label="사용자">
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.departmentName}
                      </option>
                    ))}
                  </optgroup>
                </select>
              )}
            />
            <FilterSelect
              label="기간"
              value={periodLabel}
              render={() => (
                <select
                  className={styles.nativeSelect}
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
                  aria-label="기간 필터"
                >
                  <option value="all">전체</option>
                  <option value="today">오늘</option>
                  <option value="week">최근 7일</option>
                  <option value="month">최근 30일</option>
                </select>
              )}
            />
            <FilterSelect
              label="정렬"
              value={sortLabel}
              render={() => (
                <select
                  className={styles.nativeSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  aria-label="정렬"
                >
                  <option value="newest">최신순</option>
                  <option value="oldest">오래된순</option>
                  <option value="name">이름순</option>
                  <option value="size">크기순</option>
                </select>
              )}
            />
            <div className={styles.barRight}>
              <div className="search" style={{ width: 200 }}>
                <SearchIcon size={14} />
                <input
                  placeholder="파일 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="파일 검색"
                />
              </div>
              <FileUploadButton />
            </div>
          </div>
        </section>

        <div className={styles.fcontent}>
          {scope === "all" && folders.length > 0 ? (
            <>
              <div className={styles.sectionH}>📂 폴더 {folders.length}개</div>
              <div className={styles.folderGrid}>
                {folders.map((f) => (
                  <div key={f.id} className={styles.folder}>
                    <div className={styles.folderHead}>
                      <div className={cn(styles.folderIc, folderTone[f.tone])} />
                    </div>
                    <div>
                      <div className={styles.folderName}>{f.name}</div>
                      <div className={styles.folderMeta}>{f.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className={styles.sectionH}>📄 파일 {visible.length}개</div>
          {visible.length === 0 ? (
            <div className={styles.empty}>해당 조건에 맞는 파일이 없습니다.</div>
          ) : view === "card" ? (
            <CardView files={visible} userById={userById} />
          ) : (
            <ListTable files={visible} userById={userById} detail={view === "detail"} />
          )}
        </div>
      </main>
    </div>
  );
}

function ScopeBtn({
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

function FilterSelect({
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

function ListTable({
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

function CardView({
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
