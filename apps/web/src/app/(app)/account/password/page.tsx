import { Topbar } from "@/components/shell/Topbar";
import { authService } from "@/services/auth.service";
import { getServerToken } from "@/lib/server-auth";
import { ChangePasswordForm } from "./ChangePasswordForm";
import styles from "./password.module.css";

export default async function ChangePasswordPage() {
  const token = getServerToken();
  const me = await authService.getMe(token);

  return (
    <>
      <Topbar title="비밀번호 변경" sub={`${me.name} (${me.email})`} />
      <div className="content">
        <section className={`card ${styles.card}`}>
          <div className="card__head">
            <h3>비밀번호 변경</h3>
            {me.mustChangePassword ? (
              <span className={styles.required}>변경 후 다른 기능을 사용할 수 있습니다.</span>
            ) : null}
          </div>
          <ChangePasswordForm forced={!!me.mustChangePassword} />
        </section>
      </div>
    </>
  );
}
