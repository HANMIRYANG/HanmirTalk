"use client";

import { useEffect, useState } from "react";
import styles from "./AppDialogHost.module.css";

// window.confirm / window.alert 대체 — 브라우저 기본 팝업은 도메인
// (hanmirspace.com)이 노출되고 스타일링이 불가능해서, 한미르 로고가
// 들어간 자체 다이얼로그로 통일한다.
//
// 사용법 (호출부는 기존 confirm/alert 과 거의 동일):
//   if (!(await confirmDialog("삭제하시겠습니까?"))) return;
//   alertDialog("저장에 실패했습니다.");           // await 불필요
//
// AppDialogHost 는 루트 레이아웃에 1회 마운트되어 라우트 이동에도
// 유지된다.

interface DialogRequest {
  id: number;
  kind: "confirm" | "alert";
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

type Listener = (req: DialogRequest) => void;

let hostListener: Listener | null = null;
// 호스트 마운트 전(이론상 초기 렌더 직후 극히 짧은 구간)에 들어온 요청 보관.
let pendingBeforeMount: DialogRequest[] = [];
let seq = 0;

function dispatch(req: DialogRequest) {
  if (hostListener) hostListener(req);
  else pendingBeforeMount.push(req);
}

export interface ConfirmDialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 삭제/나가기 등 파괴적 액션 — 확인 버튼이 빨간색이 된다. */
  danger?: boolean;
}

export function confirmDialog(
  message: string,
  opts: ConfirmDialogOptions = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    dispatch({ id: ++seq, kind: "confirm", message, resolve, ...opts });
  });
}

export function alertDialog(
  message: string,
  opts: { title?: string } = {}
): Promise<void> {
  return new Promise((resolve) => {
    dispatch({
      id: ++seq,
      kind: "alert",
      message,
      resolve: () => resolve(),
      ...opts
    });
  });
}

export function AppDialogHost() {
  const [requests, setRequests] = useState<DialogRequest[]>([]);
  const current = requests[0];

  useEffect(() => {
    hostListener = (req) => setRequests((prev) => [...prev, req]);
    if (pendingBeforeMount.length > 0) {
      const queued = pendingBeforeMount;
      pendingBeforeMount = [];
      setRequests((prev) => [...prev, ...queued]);
    }
    return () => {
      hostListener = null;
    };
  }, []);

  const close = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setRequests((prev) => prev.slice(1));
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;

  return (
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-modal="true"
      aria-label={current.title ?? "한미르톡 알림"}
      onClick={() => close(false)}
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.logoWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/hanmir-logo.png" alt="" className={styles.logo} />
        </div>
        {current.title ? <div className={styles.title}>{current.title}</div> : null}
        <div className={styles.message}>{current.message}</div>
        <div className={styles.buttons}>
          {current.kind === "confirm" ? (
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => close(false)}
            >
              {current.cancelLabel ?? "취소"}
            </button>
          ) : null}
          <button
            type="button"
            className={
              current.danger ? `btn ${styles.btnDanger}` : "btn btn--primary"
            }
            onClick={() => close(true)}
            autoFocus
          >
            {current.confirmLabel ?? "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
