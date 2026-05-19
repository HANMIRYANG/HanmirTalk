"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationSettings, Project, Room } from "@hanmir/shared";
import { notificationService } from "@/services/notification.service";
import { enablePush, disablePush } from "@/services/push.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "./notifications.module.css";

interface Props {
  initial: NotificationSettings;
  projects: Project[];
  rooms: Room[];
}

// Phase 6 I-4b — settings form. 변경 시 즉시 PATCH (debounced) — 한
// 토글마다 명시적 [저장] 버튼을 누르는 UX는 번거로움. 실패하면 토스트
// 대신 inline 에러 메시지로.
export function NotificationSettingsForm({ initial, projects, rooms }: Props) {
  const router = useRouter();
  const [s, setS] = useState<NotificationSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPerm(Notification.permission);
    } else {
      setBrowserPerm("unsupported");
    }
  }, []);

  const requestBrowserPerm = async () => {
    if (browserPerm === "unsupported") return;
    try {
      const p = await Notification.requestPermission();
      setBrowserPerm(p);
    } catch {
      // user dismissed
    }
  };

  const save = async (partial: Partial<NotificationSettings>) => {
    const next = { ...s, ...partial };
    setS(next);
    setError(null);
    try {
      const updated = await notificationService.updateSettings(partial);
      setS(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("설정 저장에 실패했습니다.");
    }
  };

  const toggleRoom = (roomId: string, enabled: boolean) => {
    const next = { ...s.perRoom };
    if (enabled) {
      // default가 on이므로 명시 키 자체 제거가 깔끔
      delete next[roomId];
    } else {
      next[roomId] = false;
    }
    save({ perRoom: next });
  };

  const toggleProject = (projectId: string, enabled: boolean) => {
    const next = { ...s.perProject };
    if (enabled) delete next[projectId];
    else next[projectId] = false;
    save({ perProject: next });
  };

  return (
    <div className={styles.form}>
      <h2 className={styles.h2}>전체 알림</h2>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={s.allEnabled}
          onChange={(e) => save({ allEnabled: e.target.checked })}
        />
        <span>모든 알림 받기 (꺼두면 아래 설정 무시)</span>
      </label>

      <h2 className={styles.h2}>채널별 알림</h2>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={s.browserEnabled}
          onChange={(e) => save({ browserEnabled: e.target.checked })}
        />
        <span>브라우저 OS 알림 (Notification API)</span>
      </label>
      {s.browserEnabled && browserPerm !== "granted" ? (
        <div className={styles.permRow}>
          {browserPerm === "unsupported"
            ? "이 브라우저는 OS 알림을 지원하지 않습니다."
            : browserPerm === "denied"
            ? "브라우저 설정에서 알림을 차단했습니다. 사이트 설정에서 허용으로 변경 후 새로고침하세요."
            : "OS 알림을 받으려면 권한이 필요합니다."}
          {browserPerm === "default" ? (
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={requestBrowserPerm}
            >
              권한 요청
            </button>
          ) : null}
        </div>
      ) : null}

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={s.webPushEnabled}
          onChange={async (e) => {
            const want = e.target.checked;
            try {
              if (want) {
                await enablePush();
              } else {
                await disablePush();
              }
              await save({ webPushEnabled: want });
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err);
              if (reason === "permission_denied") {
                setError("브라우저에서 알림 권한이 거부되어 푸시를 활성화할 수 없습니다.");
              } else if (reason === "push_disabled_server") {
                setError("서버 측 VAPID 키가 설정되어 있지 않습니다. 관리자에게 문의하세요.");
              } else if (reason === "push_unsupported") {
                setError("이 브라우저는 웹 푸시를 지원하지 않습니다.");
              } else {
                setError("웹 푸시 활성화에 실패했습니다.");
              }
              // Revert local UI to match server.
              setS((cur) => ({ ...cur, webPushEnabled: !want }));
            }
          }}
        />
        <span>웹 푸시 (PWA — 모바일 / 탭 닫혀있을 때도 알림)</span>
      </label>
      <div className={styles.hint}>
        웹 푸시는 HTTPS(또는 localhost) + SW 등록이 필요합니다. 모바일은 홈
        화면에 앱 추가 시 lock screen 알림 가능. dev 환경에서는 localhost로
        테스트할 수 있지만 브라우저 콘솔에 인증서 경고가 뜰 수 있습니다.
      </div>

      <h2 className={styles.h2}>채팅방별</h2>
      <div className={styles.hint}>
        체크를 풀면 해당 방의 메시지 알림이 비활성화됩니다 (멘션은 별도 정책).
      </div>
      {rooms.length === 0 ? (
        <div className={styles.empty}>참여 중인 방이 없습니다.</div>
      ) : (
        <ul className={styles.list}>
          {rooms.map((r) => {
            const enabled = s.perRoom[r.id] !== false;
            return (
              <li key={r.id} className={styles.row}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleRoom(r.id, e.target.checked)}
                  />
                  <span>{r.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className={styles.h2}>프로젝트별</h2>
      <div className={styles.hint}>
        체크를 풀면 해당 프로젝트의 업무·결정·상태 알림이 비활성화됩니다.
      </div>
      {projects.length === 0 ? (
        <div className={styles.empty}>참여 중인 프로젝트가 없습니다.</div>
      ) : (
        <ul className={styles.list}>
          {projects.map((p) => {
            const enabled = s.perProject[p.id] !== false;
            return (
              <li key={p.id} className={styles.row}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleProject(p.id, e.target.checked)}
                  />
                  <span>
                    {p.code} {p.name}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  );
}
