import { Topbar } from "@/components/shell/Topbar";
import { notificationService } from "@/services/notification.service";
import { projectService } from "@/services/project.service";
import { requireServerMe } from "@/lib/server-auth";
import { NotificationSettingsForm } from "./NotificationSettingsForm";
import styles from "./notifications.module.css";

// Phase 6 I-4b — per-user notification settings.
// 채팅방별 알림은 채팅 목록 우클릭 / 방 [더보기] 의 음소거로 일원화되어
// 이 페이지에서는 다루지 않는다.
export default async function NotificationSettingsPage() {
  const { me, token } = await requireServerMe();
  const [settings, projects] = await Promise.all([
    notificationService.getSettings({ token }),
    projectService.listProjects({ token })
  ]);

  return (
    <>
      <Topbar title="알림 설정" sub={`${me.name}님의 알림 정책`} />
      <div className="content">
        <section className={`card ${styles.card}`}>
          <NotificationSettingsForm initial={settings} projects={projects} />
        </section>
      </div>
    </>
  );
}
