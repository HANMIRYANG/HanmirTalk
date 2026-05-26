import type { ReactNode } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { requireServerMe } from "@/lib/server-auth";
import { systemService } from "@/services/system.service";
import { userService } from "@/services/user.service";
import { cn } from "@/lib/classNames";
import { StatusRefresh } from "./StatusRefresh";
import styles from "../admin.module.css";

const PENDING_USER_PREVIEW_LIMIT = 8;

// uptime / 소켓 수가 매 요청 달라지므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}일`);
  if (h) parts.push(`${h}시간`);
  parts.push(`${m}분`);
  return parts.join(" ");
}

function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border-soft)"
      }}
    >
      <span className="muted t-sm">{label}</span>
      <span className="t-sm" style={{ fontWeight: 500, textAlign: "right" }}>
        {children}
      </span>
    </div>
  );
}

export default async function AdminStatusPage() {
  const { token } = await requireServerMe();
  // #5 — users 도 같이 fetch 해 must_change_password 미해결 사용자 카드를
  // 그린다. listUsers 가 실패해도 health/version 카드는 계속 보여야 하므로
  // .catch(() => null) 로 격리.
  const [health, version, users] = await Promise.all([
    systemService.getHealth({ token }).catch(() => null),
    systemService.getVersion({ token }).catch(() => null),
    userService.listUsers({ token }).catch(() => null)
  ]);

  const activeUsers = users
    ? users.filter((u) => u.isActive !== false)
    : null;
  const pendingPasswordUsers = activeUsers
    ? activeUsers.filter((u) => u.mustChangePassword)
    : null;

  return (
    <>
      <Topbar title="서비스 상태 / 버전" sub="한미르톡 시스템 현황" />

      <section className={styles.ahead}>
        <h1>서비스 상태 / 버전</h1>
        <div className={styles.aheadSub}>
          서버 가동 상태 · 데이터베이스 · 실시간 연결 · 빌드 정보
        </div>
      </section>

      <div className={cn("content", styles.content)}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 14
          }}
        >
          <section className="card">
            <div className="card__head">
              <h3>서비스 상태</h3>
              <div className="right">
                <StatusRefresh />
              </div>
            </div>
            {health ? (
              <div>
                <StatRow label="전체 상태">
                  <Tag tone={health.status === "ok" ? "green" : "red"} dot>
                    {health.status === "ok" ? "정상" : "주의"}
                  </Tag>
                </StatRow>
                <StatRow label="저장소 어댑터">
                  {health.adapter === "postgres" ? "PostgreSQL" : "메모리 (개발)"}
                </StatRow>
                <StatRow label="가동 시간">{formatUptime(health.uptimeSeconds)}</StatRow>
                <StatRow label="시작 시각">{formatDateTime(health.startedAt)}</StatRow>
                <StatRow label="활성 실시간 연결">{health.socketClients}개</StatRow>
                <StatRow label="데이터베이스">
                  <Tag tone={health.database.ok ? "green" : "red"} dot>
                    {health.database.ok ? "연결됨" : "연결 실패"}
                  </Tag>
                </StatRow>
                {health.database.pool ? (
                  <StatRow label="DB 커넥션 풀">
                    전체 {health.database.pool.total} · 유휴{" "}
                    {health.database.pool.idle} · 대기{" "}
                    {health.database.pool.waiting}
                  </StatRow>
                ) : null}
              </div>
            ) : (
              <div className="muted t-sm" style={{ padding: 16 }}>
                상태 정보를 불러오지 못했습니다.
              </div>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <h3>버전 정보</h3>
            </div>
            {version ? (
              <div>
                <StatRow label="애플리케이션 버전">v{version.version}</StatRow>
                <StatRow label="Git 커밋">
                  <code className="t-xs">{version.gitCommit}</code>
                </StatRow>
                <StatRow label="Node.js">{version.node}</StatRow>
                <StatRow label="실행 환경">{version.env}</StatRow>
              </div>
            ) : (
              <div className="muted t-sm" style={{ padding: 16 }}>
                버전 정보를 불러오지 못했습니다.
              </div>
            )}
          </section>

          {/*
            #5 — 초기 비밀번호 변경 점검 카드. mustChangePassword=true 인
            활성 사용자가 있으면 admin 이 후속 조치(개별 안내 등)를 빠르게
            식별할 수 있게 한다. 비밀번호 자체는 노출하지 않고 신원만
            (이름·부서·직급·이메일) 표시.
          */}
          <section className="card">
            <div className="card__head">
              <h3>초기 비밀번호 변경</h3>
              <div className="right">
                {pendingPasswordUsers !== null ? (
                  pendingPasswordUsers.length === 0 ? (
                    <Tag tone="green" dot>
                      완료
                    </Tag>
                  ) : (
                    <Tag tone="red" dot>
                      조치 필요
                    </Tag>
                  )
                ) : null}
              </div>
            </div>
            {pendingPasswordUsers === null || activeUsers === null ? (
              <div className="muted t-sm" style={{ padding: 16 }}>
                사용자 정보를 불러오지 못했습니다.
              </div>
            ) : (
              <div>
                <StatRow label="활성 사용자 수">{activeUsers.length}명</StatRow>
                <StatRow label="변경 필요 사용자 수">
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        pendingPasswordUsers.length === 0
                          ? "var(--success, #15803d)"
                          : "var(--danger, #b91c1c)"
                    }}
                  >
                    {pendingPasswordUsers.length}명
                  </span>
                </StatRow>
                {health?.adapter === "memory" ? (
                  <div
                    className="muted t-xs"
                    style={{ padding: "8px 16px 0" }}
                  >
                    메모리 모드는 개발 편의상 초기 비밀번호 변경 강제가
                    비활성화될 수 있습니다.
                  </div>
                ) : null}
                {pendingPasswordUsers.length === 0 ? (
                  <div
                    className="muted t-sm"
                    style={{ padding: "12px 16px 16px" }}
                  >
                    모든 활성 사용자가 초기 비밀번호를 변경했습니다.
                  </div>
                ) : (
                  <div style={{ padding: "8px 0 12px" }}>
                    {pendingPasswordUsers
                      .slice(0, PENDING_USER_PREVIEW_LIMIT)
                      .map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            padding: "8px 16px",
                            borderBottom: "1px solid var(--border-soft)"
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              className="t-sm"
                              style={{ fontWeight: 600, color: "var(--text-1)" }}
                            >
                              {u.name}
                              {u.position ? (
                                <span
                                  className="muted t-xs"
                                  style={{ marginLeft: 6 }}
                                >
                                  {u.position}
                                </span>
                              ) : null}
                            </div>
                            <div className="muted t-xs">
                              {u.departmentName ?? "부서 미지정"}
                            </div>
                          </div>
                          <div
                            className="muted t-xs"
                            style={{
                              textAlign: "right",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 220
                            }}
                            title={u.email}
                          >
                            {u.email}
                          </div>
                        </div>
                      ))}
                    {pendingPasswordUsers.length > PENDING_USER_PREVIEW_LIMIT ? (
                      <div
                        className="muted t-xs"
                        style={{ padding: "8px 16px 0" }}
                      >
                        +{pendingPasswordUsers.length - PENDING_USER_PREVIEW_LIMIT}
                        명 더 있음
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
