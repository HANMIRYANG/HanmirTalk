import type { ReactNode } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { requireServerMe } from "@/lib/server-auth";
import { systemService } from "@/services/system.service";
import { cn } from "@/lib/classNames";
import { StatusRefresh } from "./StatusRefresh";
import styles from "../admin.module.css";

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
  const [health, version] = await Promise.all([
    systemService.getHealth({ token }).catch(() => null),
    systemService.getVersion({ token }).catch(() => null)
  ]);

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
        </div>
      </div>
    </>
  );
}
