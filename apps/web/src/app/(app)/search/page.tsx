import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { getServerToken } from "@/lib/server-auth";
import styles from "./search.module.css";

interface SearchPageProps {
  searchParams: { q?: string; roomId?: string };
}

// Phase 2 E-3 — message search results. Topbar form posts here via GET so
// the URL is shareable and reload-stable. Results are scoped server-side
// to rooms the caller can read (D-8 + E-3 route filter).
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const token = getServerToken();
  const rawQuery = (searchParams.q ?? "").trim();
  const roomId = searchParams.roomId?.trim() || undefined;

  // Always render the search shell so the user sees what they typed even
  // for invalid queries. Empty / 1-char queries get a hint instead of
  // hitting the API.
  const tooShort = rawQuery.length > 0 && rawQuery.length < 2;
  const results =
    !tooShort && rawQuery.length >= 2
      ? await chatService.searchMessages(rawQuery, { token, roomId })
      : [];

  // Pull rooms so we can label each hit with its room name. Single round
  // trip; the auth filter on /rooms already only returns accessible ones.
  const rooms = rawQuery.length >= 2 ? await chatService.listRooms({ token }) : [];
  const roomById = new Map(rooms.map((r) => [r.id, r] as const));

  return (
    <>
      <Topbar
        title="검색"
        sub={
          rawQuery
            ? `"${rawQuery}" 검색 결과 ${results.length}건`
            : "메시지 검색"
        }
      />
      <div className="content">
        <form action="/search" method="get" className={styles.searchForm}>
          <input
            type="text"
            name="q"
            defaultValue={rawQuery}
            placeholder="메시지 본문에서 검색 (2자 이상)"
            className={styles.searchInput}
            autoFocus
          />
          {roomId ? <input type="hidden" name="roomId" value={roomId} /> : null}
          <button type="submit" className="btn btn--primary btn--sm">
            검색
          </button>
        </form>

        {!rawQuery ? (
          <div className={styles.empty}>
            상단 입력란에 검색어를 입력하세요. 메시지 본문에서 일치하는 항목을 찾습니다.
          </div>
        ) : tooShort ? (
          <div className={styles.empty}>
            검색어는 2자 이상 입력해주세요.
          </div>
        ) : results.length === 0 ? (
          <div className={styles.empty}>
            &ldquo;{rawQuery}&rdquo;와(과) 일치하는 메시지가 없습니다.
          </div>
        ) : (
          <ul className={styles.list}>
            {results.map((m) => {
              const room = roomById.get(m.roomId);
              return (
                <li key={m.id} className={styles.item}>
                  <Link href={`/chat/${m.roomId}`} className={styles.link}>
                    <div className={styles.itemHead}>
                      <Avatar
                        initials={m.initials}
                        tone={m.avatarTone ?? "default"}
                        size="sm"
                      />
                      <div className={styles.itemMeta}>
                        <div className={styles.itemAuthor}>
                          {m.authorName}
                          {m.authorRole ? (
                            <span className={styles.itemRole}>· {m.authorRole}</span>
                          ) : null}
                        </div>
                        <div className={styles.itemRoom}>
                          {room ? `# ${room.name}` : "(알 수 없는 방)"} · {formatStamp(m.createdAt)}
                          {m.editedAt ? " · (수정됨)" : ""}
                        </div>
                      </div>
                    </div>
                    <div className={styles.itemBody}>
                      {highlight(m.body, rawQuery)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function formatStamp(iso: string): string {
  // Display the message timestamp in a user-friendly format. Falls back
  // to the raw string if Date.parse can't handle it (legacy memory-mode
  // timestamps like "오후 2:14").
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Inline mark of the matched substring. Case-insensitive single-pass split.
function highlight(body: string, needle: string): React.ReactNode {
  if (!needle) return body;
  const lower = body.toLowerCase();
  const n = needle.toLowerCase();
  const out: React.ReactNode[] = [];
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
