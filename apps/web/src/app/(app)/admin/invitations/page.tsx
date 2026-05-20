import { Topbar } from "@/components/shell/Topbar";
import { requireServerMe } from "@/lib/server-auth";
import { invitationService } from "@/services/invitation.service";
import { departmentService } from "@/services/department.service";
import { cn } from "@/lib/classNames";
import { InvitationsWorkspace } from "./InvitationsWorkspace";
import styles from "../admin.module.css";

// Phase 8 K-2 — 사용자 초대 / 가입 승인. 역할 가드는 admin/layout.tsx.
export default async function AdminInvitationsPage() {
  const { token } = await requireServerMe();
  const [invitations, departments] = await Promise.all([
    invitationService.listInvitations({ token }),
    departmentService.listDepartments({ token })
  ]);

  return (
    <>
      <Topbar title="초대 / 가입 승인" sub="한미르톡 사용자 초대" />

      <section className={styles.ahead}>
        <h1>초대 / 가입 승인</h1>
        <div className={styles.aheadSub}>
          이메일로 가입 초대를 발급하고 수락 상태를 관리합니다.
        </div>
      </section>

      <div className={cn("content", styles.content)}>
        <InvitationsWorkspace
          initialInvitations={invitations}
          departments={departments}
        />
      </div>
    </>
  );
}
