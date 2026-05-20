import type { InvitationPreview } from "@hanmir/shared";
import { invitationService } from "@/services/invitation.service";
import { AcceptInviteForm } from "./AcceptInviteForm";
import styles from "../login/login.module.css";

interface Props {
  searchParams: { token?: string | string[] };
}

// Phase 8 K-2 — 공개 가입 초대 수락 페이지 ((app) 그룹 밖 → 인증 불필요).
export default async function InvitePage({ searchParams }: Props) {
  const token =
    typeof searchParams.token === "string" ? searchParams.token : "";
  const preview: InvitationPreview = token
    ? await invitationService
        .getInvitationPreview(token)
        .catch(() => ({ valid: false }))
    : { valid: false };

  return (
    <div className={styles.shellWrap}>
      <div className={styles.shell}>
        <section className={styles.aside}>
          <div className={styles.logo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/hanmir-logo.png" alt="한미르 로고" />
            <div>
              <div className={styles.logoTitle}>한미르톡</div>
              <div className={styles.logoSub}>한미르주식회사 · 사내 협업 플랫폼</div>
            </div>
          </div>

          <div className={styles.head}>
            한미르톡에 오신 것을
            <br />
            <em>환영합니다.</em>
          </div>
          <div className={styles.body}>
            관리자가 보낸 초대로 사내 계정을 만드는 단계입니다.
            <br />
            이름과 비밀번호를 설정하면 바로 이용할 수 있습니다.
          </div>
        </section>

        <AcceptInviteForm token={token} preview={preview} />
      </div>
    </div>
  );
}
