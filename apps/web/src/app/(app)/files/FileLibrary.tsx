"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FileEntry,
  FileFolder,
  FileKind,
  FolderContents,
  Project,
  User
} from "@hanmir/shared";
import {
  CheckIcon,
  ClockIcon,
  FolderIcon,
  PinIcon,
  SearchIcon
} from "@/components/ui/icons";
import { Pagination } from "@/components/ui/Pagination";
import { fileService } from "@/services/file.service";
import { ApiError } from "@/services/api-client";
import { cn } from "@/lib/classNames";
import { FileUploadButton } from "./FileUploadButton";
import { CardView, FilterSelect, ListTable, ScopeBtn, fileTag } from "./FileViews";
import { FolderGrid } from "./FolderGrid";
import { FolderCreateModal } from "./FolderCreateModal";
import { FolderPasswordModal } from "./FolderPasswordModal";
import { FolderMembersModal } from "./FolderMembersModal";
import styles from "./files.module.css";

type ScopeKind =
  | "all"
  | "recent"
  | "starred"
  | "mine"
  | { kind: "project"; id: string; name: string }
  | { kind: "folder"; id: string }
  | { kind: "type"; type: FileKind };

type ViewMode = "list" | "card" | "detail";
type TypeFilter = "all" | "doc" | "spreadsheet" | "image" | "zip" | "pdf" | "ppt";
type OwnerFilter = "all" | "me" | string; // user id
type PeriodFilter = "all" | "today" | "week" | "month";
type SortBy = "newest" | "oldest" | "name" | "size";

const PAGE_SIZE = 50;

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

// 세션 한정 폴더 비밀번호 보관 — 새로고침해도 같은 탭에서는 재입력 불필요.
function storedFolderPw(folderId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.sessionStorage.getItem(`folder-pw:${folderId}`) ?? undefined;
}

function storeFolderPw(folderId: string, pw: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(`folder-pw:${folderId}`, pw);
}

interface FileLibraryProps {
  folders: FileFolder[];
  files: FileEntry[];
  users: User[];
  projects: Project[];
  meId: string;
  meRole: string;
}

export function FileLibrary({
  folders,
  files,
  users,
  projects,
  meId,
  meRole
}: FileLibraryProps) {
  const router = useRouter();
  const isAdmin = meRole === "admin" || meRole === "super_admin";

  const [scope, setScope] = useState<ScopeKind>("all");
  const [view, setView] = useState<ViewMode>("list");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // 폴더 상태 — SSR folders 를 로컬 복사해 생성/삭제를 즉시 반영하고,
  // router.refresh() 가 가져온 새 props 로 다시 동기화한다.
  const [folderList, setFolderList] = useState<FileFolder[]>(folders);
  useEffect(() => setFolderList(folders), [folders]);
  const [folderContents, setFolderContents] = useState<FolderContents | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderReload, setFolderReload] = useState(0);
  const [pwPrompt, setPwPrompt] = useState<{
    guardId: string;
    guardName: string;
    error: string | null;
  } | null>(null);
  const [createModal, setCreateModal] = useState<
    { parentId?: string; parentName?: string } | null
  >(null);
  const [membersModal, setMembersModal] = useState<FileFolder | null>(null);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);
  const folderById = useMemo(
    () => new Map(folderList.map((f) => [f.id, f] as const)),
    [folderList]
  );
  const rootFolders = useMemo(
    () => folderList.filter((f) => !f.parentId),
    [folderList]
  );

  const currentFolderId =
    typeof scope === "object" && scope.kind === "folder" ? scope.id : null;
  const currentFolder = currentFolderId
    ? folderContents?.folder.id === currentFolderId
      ? folderContents.folder
      : folderById.get(currentFolderId) ?? null
    : null;

  // 폴더 조상 체인 (브레드크럼·권한·비밀번호 가드 계산용)
  const folderPath = useMemo(() => {
    if (!currentFolderId) return [] as FileFolder[];
    const path: FileFolder[] = [];
    let cur = folderById.get(currentFolderId);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? folderById.get(cur.parentId) : undefined;
    }
    return path;
  }, [currentFolderId, folderById]);

  const rootOfCurrent = folderPath[0] ?? null;
  const canWriteInCurrent =
    isAdmin || (rootOfCurrent ? rootOfCurrent.memberIds.includes(meId) : false);

  // 자기 자신 또는 조상 중 비밀번호가 걸린 가장 가까운 폴더 — 저장된
  // 비밀번호를 요청에 실어 보내는 용도 (검증은 서버).
  const nearestGuard = useMemo(() => {
    for (let i = folderPath.length - 1; i >= 0; i--) {
      if (folderPath[i].hasPassword) return folderPath[i];
    }
    return null;
  }, [folderPath]);

  // 폴더 내용 로드 — scope 가 폴더일 때.
  useEffect(() => {
    if (!currentFolderId) {
      setFolderContents(null);
      setFolderError(null);
      return;
    }
    let cancelled = false;
    setFolderLoading(true);
    setFolderError(null);
    const guardPw = nearestGuard ? storedFolderPw(nearestGuard.id) : undefined;
    fileService
      .folderContents(currentFolderId, { password: guardPw })
      .then((contents) => {
        if (cancelled) return;
        setFolderContents(contents);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.message === "password_required") {
          const body = (err.body ?? {}) as { folderId?: string; folderName?: string };
          setPwPrompt({
            guardId: body.folderId ?? currentFolderId,
            guardName: body.folderName ?? "보호된 폴더",
            error: guardPw ? "비밀번호가 일치하지 않습니다." : null
          });
          setFolderContents(null);
          return;
        }
        setFolderError("폴더를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => {
        if (!cancelled) setFolderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentFolderId, folderReload, nearestGuard]);

  // 필터/검색/스코프가 바뀌면 1페이지로.
  useEffect(() => {
    setPage(1);
  }, [scope, typeFilter, ownerFilter, periodFilter, sortBy, search]);

  const reloadFolder = useCallback(() => setFolderReload((n) => n + 1), []);

  const openFolder = useCallback((folder: FileFolder) => {
    setScope({ kind: "folder", id: folder.id });
  }, []);

  const onPasswordSubmit = (pw: string) => {
    if (!pwPrompt) return;
    storeFolderPw(pwPrompt.guardId, pw);
    setPwPrompt(null);
    reloadFolder();
  };

  const onFolderCreated = (created: FileFolder) => {
    setFolderList((prev) => [...prev, created]);
    if (created.parentId && created.parentId === currentFolderId) reloadFolder();
    router.refresh();
  };

  const onFolderDelete = async (folder: FileFolder) => {
    if (!window.confirm(`"${folder.name}" 폴더를 삭제할까요? (빈 폴더만 삭제됩니다)`)) {
      return;
    }
    try {
      await fileService.deleteFolder(folder.id);
      setFolderList((prev) => prev.filter((f) => f.id !== folder.id));
      if (folder.id === currentFolderId) {
        setScope(folder.parentId ? { kind: "folder", id: folder.parentId } : "all");
      } else if (folder.parentId === currentFolderId) {
        reloadFolder();
      }
      router.refresh();
    } catch (err) {
      window.alert(
        err instanceof ApiError && err.message === "folder_not_empty"
          ? "비어있지 않은 폴더는 삭제할 수 없습니다."
          : "폴더 삭제에 실패했습니다."
      );
    }
  };

  const onMembersUpdated = (updated: FileFolder) => {
    setFolderList((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    router.refresh();
  };

  // Counts per scope — all from `files` once.
  const counts = useMemo(() => {
    const out = {
      all: files.length,
      recent: files.filter((f) => isInPeriod(f.uploadedAt, "week")).length,
      starred: files.filter((f) => f.starred).length,
      mine: files.filter((f) => f.uploaderId === meId).length,
      perProject: new Map<string, number>(),
      perType: { doc: 0, xls: 0, img: 0, zip: 0, pdf: 0, ppt: 0 } as Record<FileKind, number>
    };
    for (const f of files) {
      if (f.projectId) {
        out.perProject.set(f.projectId, (out.perProject.get(f.projectId) ?? 0) + 1);
      }
      out.perType[f.kind] = (out.perType[f.kind] ?? 0) + 1;
    }
    return out;
  }, [files, meId]);

  const scopedFiles = useMemo(() => {
    if (scope === "all") return files;
    if (scope === "recent") return files.filter((f) => isInPeriod(f.uploadedAt, "week"));
    if (scope === "starred") return files.filter((f) => f.starred);
    if (scope === "mine") return files.filter((f) => f.uploaderId === meId);
    if (typeof scope === "object" && scope.kind === "project")
      return files.filter((f) => f.projectId === scope.id);
    if (typeof scope === "object" && scope.kind === "folder")
      return folderContents?.files ?? [];
    if (typeof scope === "object" && scope.kind === "type")
      return files.filter((f) => f.kind === scope.type);
    return files;
  }, [files, scope, meId, folderContents]);

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

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged =
    visible.length > PAGE_SIZE
      ? visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
      : visible;

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
      : scope.kind === "project"
      ? `${scope.name}`
      : scope.kind === "folder"
      ? currentFolder?.name ?? "폴더"
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

  const isFolderScope = currentFolderId != null;

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
        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          폴더
        </div>
        {rootFolders.length === 0 ? (
          <div className={styles.scopeEmpty}>폴더 없음</div>
        ) : (
          rootFolders.map((f) => (
            <ScopeBtn
              key={f.id}
              icon={<FolderIcon size={14} />}
              label={f.hasPassword ? `🔒 ${f.name}` : f.name}
              count={f.fileCount}
              active={rootOfCurrent?.id === f.id}
              onClick={() => openFolder(f)}
            />
          ))
        )}

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
            {isFolderScope && folderPath.length > 0 ? (
              folderPath.map((f, i) => (
                <span key={f.id}>
                  <span className={styles.sep}>›</span>
                  {i === folderPath.length - 1 ? (
                    <b>
                      {f.hasPassword ? "🔒 " : ""}
                      {f.name}
                    </b>
                  ) : (
                    <button
                      type="button"
                      className={styles.crumbLink}
                      onClick={() => openFolder(f)}
                    >
                      {f.name}
                    </button>
                  )}
                </span>
              ))
            ) : (
              <>
                <span className={styles.sep}>›</span>
                <b>{scopeLabel}</b>
              </>
            )}
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
              {isFolderScope ? (
                canWriteInCurrent ? (
                  <FileUploadButton
                    folderId={currentFolderId ?? undefined}
                    onUploaded={reloadFolder}
                  />
                ) : null
              ) : (
                <FileUploadButton />
              )}
            </div>
          </div>
        </section>

        <div className={styles.fcontent}>
          {scope === "all" ? (
            <>
              <div className={styles.folderToolbar}>
                <div className={styles.sectionH} style={{ margin: 0 }}>
                  📂 부서 폴더 {rootFolders.length}개
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => setCreateModal({})}
                  >
                    + 새 부서 폴더
                  </button>
                ) : null}
              </div>
              {rootFolders.length === 0 ? (
                <div className={styles.empty}>
                  아직 폴더가 없습니다. 관리자가 부서 폴더를 만들 수 있습니다.
                </div>
              ) : (
                <FolderGrid
                  folders={rootFolders}
                  isAdmin={isAdmin}
                  isRootLevel
                  onOpen={openFolder}
                  onManageMembers={(f) => setMembersModal(f)}
                  onDelete={onFolderDelete}
                />
              )}
            </>
          ) : null}

          {isFolderScope ? (
            folderLoading ? (
              <div className={styles.empty}>폴더를 불러오는 중...</div>
            ) : folderError ? (
              <div className={styles.folderError} role="alert">
                {folderError}
              </div>
            ) : folderContents ? (
              <>
                <div className={styles.folderToolbar}>
                  <div className={styles.sectionH} style={{ margin: 0 }}>
                    📂 하위 폴더 {folderContents.subfolders.length}개
                  </div>
                  {canWriteInCurrent ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() =>
                        setCreateModal({
                          parentId: currentFolderId ?? undefined,
                          parentName: currentFolder?.name
                        })
                      }
                    >
                      + 새 폴더
                    </button>
                  ) : (
                    <span className="muted t-xs">
                      이 폴더의 참여자만 하위 폴더를 만들 수 있습니다.
                    </span>
                  )}
                </div>
                {folderContents.subfolders.length > 0 ? (
                  <FolderGrid
                    folders={folderContents.subfolders}
                    isAdmin={isAdmin}
                    isRootLevel={false}
                    onOpen={openFolder}
                    onDelete={onFolderDelete}
                  />
                ) : null}
              </>
            ) : !pwPrompt ? (
              <div className={styles.empty}>폴더 내용을 표시할 수 없습니다.</div>
            ) : (
              <div className={styles.empty}>비밀번호를 입력하면 폴더가 열립니다.</div>
            )
          ) : null}

          {!isFolderScope || folderContents ? (
            <>
              <div className={styles.sectionH}>📄 파일 {visible.length}개</div>
              {visible.length === 0 ? (
                <div className={styles.empty}>해당 조건에 맞는 파일이 없습니다.</div>
              ) : view === "card" ? (
                <CardView files={paged} userById={userById} />
              ) : (
                <ListTable files={paged} userById={userById} detail={view === "detail"} />
              )}
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </>
          ) : null}
        </div>
      </main>

      <FolderCreateModal
        open={createModal != null}
        onClose={() => setCreateModal(null)}
        parentId={createModal?.parentId}
        parentName={createModal?.parentName}
        users={users}
        onCreated={onFolderCreated}
      />
      <FolderPasswordModal
        open={pwPrompt != null}
        folderName={pwPrompt?.guardName ?? ""}
        error={pwPrompt?.error}
        onClose={() => {
          setPwPrompt(null);
          // 비밀번호 입력을 취소하면 상위로 빠져나간다.
          setScope("all");
        }}
        onSubmit={onPasswordSubmit}
      />
      <FolderMembersModal
        open={membersModal != null}
        folder={membersModal}
        users={users}
        onClose={() => setMembersModal(null)}
        onUpdated={onMembersUpdated}
      />
    </div>
  );
}
