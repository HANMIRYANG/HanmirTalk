import { Topbar } from "@/components/shell/Topbar";
import { searchService } from "@/services/search.service";
import { chatService } from "@/services/chat.service";
import { requireServerMe } from "@/lib/server-auth";
import { SearchResultsView } from "./SearchResultsView";
import styles from "./search.module.css";

interface SearchPageProps {
  searchParams: { q?: string };
}

// Phase 9 — 통합 검색. Topbar 검색 폼이 GET으로 여기에 posts → URL 공유·
// 새로고침 안정. 메시지·파일·프로젝트·제품을 한 번에 검색한다.
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { token } = await requireServerMe();
  const rawQuery = (searchParams.q ?? "").trim();
  const tooShort = rawQuery.length > 0 && rawQuery.length < 2;

  const results =
    !tooShort && rawQuery.length >= 2
      ? await searchService.search(rawQuery, { token })
      : null;

  // 메시지 hit에 방 이름을 붙이기 위해 방 목록을 한 번 조회 (접근 가능한
  // 방만 반환되므로 추가 권한 검사 불필요).
  const rooms =
    results && results.messages.length > 0
      ? await chatService.listRooms({ token })
      : [];
  const roomNames: Record<string, string> = {};
  for (const r of rooms) roomNames[r.id] = r.name;

  const total = results
    ? results.messages.length +
      results.files.length +
      results.projects.length +
      results.products.length +
      (results.tasks?.length ?? 0)
    : 0;

  return (
    <>
      <Topbar
        title="검색"
        sub={rawQuery ? `"${rawQuery}" 검색 결과 ${total}건` : "통합 검색"}
      />
      <div className="content">
        <form action="/search" method="get" className={styles.searchForm}>
          <input
            type="text"
            name="q"
            defaultValue={rawQuery}
            placeholder="메시지·파일·프로젝트·업무·제품 검색 (2자 이상)"
            className={styles.searchInput}
            autoFocus
          />
          <button type="submit" className="btn btn--primary btn--sm">
            검색
          </button>
        </form>

        {!rawQuery ? (
          <div className={styles.empty}>
            상단 입력란에 검색어를 입력하세요. 메시지·파일·프로젝트·업무·제품을
            한 번에 검색합니다.
          </div>
        ) : tooShort ? (
          <div className={styles.empty}>검색어는 2자 이상 입력해주세요.</div>
        ) : results ? (
          <SearchResultsView results={results} roomNames={roomNames} />
        ) : null}
      </div>
    </>
  );
}
