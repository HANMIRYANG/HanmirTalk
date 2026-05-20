import { Topbar } from "@/components/shell/Topbar";
import { requireServerMe } from "@/lib/server-auth";
import { auditService } from "@/services/audit.service";
import { cn } from "@/lib/classNames";
import { AuditWorkspace } from "./AuditWorkspace";
import styles from "../admin.module.css";

const PAGE_SIZE = 25;

// Phase 8 K-5 — 감사 로그. 역할 가드는 admin/layout.tsx.
export default async function AdminAuditPage() {
  const { token } = await requireServerMe();
  const initial = await auditService.searchAuditLogs(
    { limit: PAGE_SIZE, offset: 0 },
    { token }
  );

  return (
    <>
      <Topbar title="감사 로그" sub="한미르톡 운영 활동 기록" />

      <section className={styles.ahead}>
        <h1>감사 로그</h1>
        <div className={styles.aheadSub}>
          관리자 활동 · 인증 · 데이터 변경 이력을 검색합니다.
        </div>
      </section>

      <div className={cn("content", styles.content)}>
        <AuditWorkspace initial={initial} pageSize={PAGE_SIZE} />
      </div>
    </>
  );
}
