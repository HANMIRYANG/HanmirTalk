import Link from "next/link";
import { Topbar } from "@/components/shell/Topbar";
import { ChatList } from "@/components/chat/ChatList";
import { NewChatLauncher } from "@/components/chat/NewChatLauncher";
import { Avatar } from "@/components/ui/Avatar";
import { chatService } from "@/services/chat.service";
import { requireServerMe } from "@/lib/server-auth";
import styles from "./chat.module.css";

// Auth guard is enforced in apps/web/src/app/(app)/layout.tsx.
//
// 채팅 홈은 "채팅 전용" 바로가기 패널이다 — 업무/공지/활동 요약은
// /dashboard 가 전담한다 (이전에는 대시보드와 같은 데이터를 전부 다시
// 페치해 내용이 중복되고 진입이 무거웠다). 여기서는 ChatList 를 그리기
// 위해 이미 필요한 방 목록만 사용하므로 추가 API 호출이 없다.
export default async function ChatHomePage() {
  const { me, token } = await requireServerMe();
  const rooms = await chatService.listRooms({ token });

  const unreadRooms = rooms.filter((r) => r.unread > 0).slice(0, 8);
  const pinnedRooms = rooms.filter((r) => r.pinned);
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  return (
    <div className={styles.row}>
      <ChatList
        rooms={rooms}
        currentUserId={me.id}
        isAdmin={me.role === "admin" || me.role === "super_admin"}
      />
      <main className={styles.main}>
        <Topbar title="채팅" sub={`${rooms.length}개 대화방`} />
        <div className="content">
          <div className={styles.welcome}>
            <div className={styles.welcomeHead}>
              <div className={styles.hello}>
                안녕하세요, <em>{me.name}</em> {me.position}님 👋
              </div>
              <div className={styles.helloSub}>오늘은 {dateLabel}입니다.</div>
            </div>

            <section className="card">
              <div className="card__head">
                <div className="card__title">안 읽은 대화</div>
                <span className="muted t-xs" style={{ marginLeft: "auto" }}>
                  {unreadRooms.length > 0 ? `${unreadRooms.length}개 대화방` : ""}
                </span>
              </div>
              {unreadRooms.length === 0 ? (
                <div className={styles.emptyRow}>모든 메시지를 확인했습니다 🎉</div>
              ) : (
                <div className={styles.roomList}>
                  {unreadRooms.map((room) => (
                    <Link
                      key={room.id}
                      href={`/chat/${room.id}`}
                      className={styles.roomRow}
                    >
                      <Avatar
                        initials={room.avatarLabel ?? room.name.slice(0, 2)}
                        tone={room.avatarTone ?? "default"}
                      />
                      <div className={styles.roomMain}>
                        <div className={styles.roomName}>{room.name}</div>
                        <div className={styles.roomPreview}>
                          {room.lastMessageAuthor ? (
                            <b>{room.lastMessageAuthor}: </b>
                          ) : null}
                          {room.lastMessagePreview}
                        </div>
                      </div>
                      <span className={styles.unreadBadge}>{room.unread}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {pinnedRooms.length > 0 ? (
              <section className={`card ${styles.spacedCard}`}>
                <div className="card__head">
                  <div className="card__title">고정된 대화</div>
                </div>
                <div className={styles.pinChips}>
                  {pinnedRooms.map((room) => (
                    <Link
                      key={room.id}
                      href={`/chat/${room.id}`}
                      className={styles.pinChip}
                    >
                      ★ {room.name}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <div className={styles.quickActions}>
              <NewChatLauncher currentUserId={me.id} />
              <Link href="/dashboard" className="btn btn--outline">
                대시보드 →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
