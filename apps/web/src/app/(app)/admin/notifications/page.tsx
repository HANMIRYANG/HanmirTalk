import { Topbar } from "@/components/shell/Topbar";
import { requireServerMe } from "@/lib/server-auth";
import { orgNotificationService } from "@/services/org-notification.service";
import { cn } from "@/lib/classNames";
import { OrgNotificationsWorkspace } from "./OrgNotificationsWorkspace";
import styles from "../admin.module.css";

// Phase 8 K-4 — 전사 기본 알림 정책. 역할 가드는 admin/layout.tsx.
export default async function AdminNotificationsPage() {
  const { token } = await requireServerMe();
  const defaults = await orgNotificationService.listDefaults({ token });

  return (
    <>
      <Topbar title="알림 정책" sub="전사 기본 알림 설정" />

      <section className={styles.ahead}>
        <h1>알림 정책</h1>
        <div className={styles.aheadSub}>
          알림 종류별 회사 전체 발송 여부입니다. 끄면 해당 종류 알림은 전 직원에게
          발송되지 않습니다. 개인별 세부 설정은 각 사용자의 알림 설정에서
          조정합니다.
        </div>
      </section>

      <div className={cn("content", styles.content)}>
        <OrgNotificationsWorkspace initial={defaults} />
      </div>
    </>
  );
}
