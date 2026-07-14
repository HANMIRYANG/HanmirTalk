"use client";

// PPT 대기 회의 목록 모달 — 방 헤더의 "PPT 대기 N" 버튼이 연다.
// awaiting_ppt 상태 회의를 5개씩 페이지네이션으로 보여주고, 행마다
// [PPT 첨부]/[건너뛰기] 를 제공한다 (회의 시작자·관리자만 활성).
// 헤더를 점유하던 안내 바를 대체 — 같은 방에서 연속 회의를 시작해도
// 이전 회의들의 PPT 를 여기서 나중에(자동 진행 전까지) 처리할 수 있다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Meeting, MeetingListPage } from "@hanmir/shared";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { ApiError } from "@/services/api-client";
import { meetingService } from "@/services/meeting.service";
import { confirmDialog, alertDialog } from "@/components/ui/AppDialogHost";
import styles from "./PptWaitModal.module.css";

const PAGE_SIZE = 5;

interface PptWaitModalProps {
  roomId: string;
  currentUserId: string;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
}

function fmtKst(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}.${dd} ${hh}:${mi}`;
}

function fmtRemaining(deadlineIso?: string): string {
  if (!deadlineIso) return "";
  const ms = Date.parse(deadlineIso) - Date.now();
  if (ms <= 0) return "곧 자동 진행";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `약 ${h}시간 ${m}분 후 자동 진행`;
  return `약 ${m}분 후 자동 진행`;
}

export function PptWaitModal({
  roomId,
  currentUserId,
  isAdmin,
  open,
  onClose
}: PptWaitModalProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MeetingListPage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMeetingIdRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (p: number) => {
      try {
        const result = await meetingService.listMeetings({
          roomId,
          status: ["awaiting_ppt"],
          limit: PAGE_SIZE,
          offset: (p - 1) * PAGE_SIZE
        });
        // 액션/타임아웃으로 마지막 페이지가 비면 앞 페이지로 클램프.
        if (result.rows.length === 0 && result.total > 0 && p > 1) {
          setPage(p - 1);
          return;
        }
        setData(result);
      } catch {
        setData({ rows: [], total: 0 });
      }
    },
    [roomId]
  );

  useEffect(() => {
    if (!open) return;
    void fetchPage(page);
  }, [open, page, fetchPage]);

  // 모달을 닫았다 다시 열면 1페이지부터.
  useEffect(() => {
    if (!open) setPage(1);
  }, [open]);

  const afterAction = useCallback(async () => {
    await fetchPage(page);
    router.refresh();
  }, [fetchPage, page, router]);

  const onPickFile = useCallback((meetingId: string) => {
    pendingMeetingIdRef.current = meetingId;
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // 같은 파일 재선택도 change 가 뜨게 리셋
      const meetingId = pendingMeetingIdRef.current;
      pendingMeetingIdRef.current = null;
      if (!file || !meetingId) return;
      setBusyId(meetingId);
      try {
        await meetingService.uploadPpt(meetingId, file);
      } catch (error) {
        if (error instanceof ApiError && error.status === 422) {
          alertDialog(
            "PPTX 파일을 읽을 수 없습니다. 파일을 확인한 뒤 다시 업로드해 주세요."
          );
        } else if (error instanceof ApiError && error.status === 409) {
          // 이미 진행됨 (건너뛰기/타임아웃 선행) — 목록 갱신으로 정리
        } else {
          alertDialog("PPT 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        setBusyId(null);
        await afterAction();
      }
    },
    [afterAction]
  );

  const onSkip = useCallback(
    async (meeting: Meeting) => {
      if (!(await confirmDialog(`"${meeting.title}" 회의록을 PPT 없이 생성할까요?`))) return;
      setBusyId(meeting.id);
      try {
        await meetingService.skipPpt(meeting.id);
      } catch {
        // 409(이미 진행됨) 포함 — 목록 갱신으로 정리
      } finally {
        setBusyId(null);
        await afterAction();
      }
    },
    [afterAction]
  );

  const pageCount = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="PPT 업로드 대기 중인 회의"
      description="부서별 주간보고 PPT(.pptx)를 첨부하면 회의록에 반영됩니다. 대기 시간이 지나면 PPT 없이 자동 진행됩니다."
      width={560}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={(e) => void onFileChange(e)}
      />
      {!data ? (
        <p className={styles.empty}>불러오는 중…</p>
      ) : data.total === 0 ? (
        <p className={styles.empty}>PPT 업로드를 기다리는 회의가 없습니다.</p>
      ) : (
        <>
          <ul className={styles.list}>
            {data.rows.map((m) => {
              const canAct = m.startedBy === currentUserId || isAdmin;
              const busy = busyId === m.id;
              return (
                <li key={m.id} className={styles.row}>
                  <div className={styles.info}>
                    <span className={styles.title}>{m.title}</span>
                    <span className={styles.meta}>
                      {m.endedAt ? `${fmtKst(m.endedAt)} 종료` : ""}
                      {m.startedByName ? ` · ${m.startedByName}` : ""}
                      {m.pptDeadlineAt ? ` · ${fmtRemaining(m.pptDeadlineAt)}` : ""}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={!canAct || busy}
                      onClick={() => onPickFile(m.id)}
                      title={canAct ? undefined : "회의 시작자 또는 관리자만 첨부할 수 있습니다"}
                    >
                      {busy ? "처리 중…" : "PPT 첨부"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={!canAct || busy}
                      onClick={() => void onSkip(m)}
                    >
                      건너뛰기
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}
    </Modal>
  );
}
