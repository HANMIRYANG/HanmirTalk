import { Topbar } from "@/components/shell/Topbar";
import { notificationService } from "@/services/notification.service";
import { projectService } from "@/services/project.service";
import { chatService } from "@/services/chat.service";
import { requireServerMe } from "@/lib/server-auth";
import { NotificationSettingsForm } from "./NotificationSettingsForm";
import styles from "./notifications.module.css";

// Phase 6 I-4b — per-user notification settings.
export default async function NotificationSettingsPage() {
  const { me, token } = await requireServerMe();
  const [settings, projects, rooms] = await Promise.all([
    notificationService.getSettings({ token }),
    projectService.listProjects({ token }),
    chatService.listRooms({ token })
  ]);

  return (
    <>
      <Topbar title="알림 설정" sub={`${me.name}님의 알림 정책`} />
      <div className="content">
        <section className={`card ${styles.card}`}>
          <NotificationSettingsForm
            initial={settings}
            projects={projects}
            rooms={rooms}
          />
        </section>
      </div>
    </>
  );
}
