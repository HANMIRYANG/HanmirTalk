"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuditLogPage, AuditLogQuery } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { auditService } from "@/services/audit.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import styles from "../admin.module.css";
import fstyles from "../admin-forms.module.css";

interface Props {
  initial: AuditLogPage;
  pageSize: number;
}

const LEVEL_TONE: Record<string, "default" | "amber" | "red"> = {
  info: "default",
  warn: "amber",
  danger: "red"
};
const LEVEL_LABEL: Record<string, string> = {
  info: "정보",
  warn: "경고",
  danger: "위험"
};

function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export function AuditWorkspace({ initial, pageSize }: Props) {
  const router = useRouter();
  const [data, setData] = useState<AuditLogPage>(initial);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  const fetchPage = async (filters: AuditLogQuery, nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditService.searchAuditLogs({
        ...filters,
        limit: pageSize,
        offset: nextPage * pageSize
      });
      setData(res);
      setPage(nextPage);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      setError("감사 로그를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // Current filter inputs as a query — pagination reuses this snapshot.
  const currentFilters = (): AuditLogQuery => {
    const f: AuditLogQuery = {};
    if (action) f.action = action;
    if (actor.trim()) f.actor = actor.trim();
    if (after) f.after = after;
    if (before) f.before = before;
    return f;
  };

  const onApply = () => void fetchPage(currentFilters(), 0);

  const onReset = () => {
    setAction("");
    setActor("");
    setAfter("");
    setBefore("");
    void fetchPage({}, 0);
  };

  return (
    <section className="card">
      <div className="card__head">
        <h3>감사 로그</h3>
        <span className="muted t-xs">총 {data.total}건</span>
      </div>

      <div style={{ padding: 16 }}>
        <div className={fstyles.formGrid}>
          <label>
            액션
            <select
              className="field"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">전체</option>
              {data.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            행위자
            <input
              className="field"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="이름 일부"
            />
          </label>
          <label>
            시작일
            <input
              className="field"
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              className="field"
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
            />
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={onReset}
            disabled={loading}
          >
            초기화
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onApply}
            disabled={loading}
          >
            {loading ? "조회 중..." : "조회"}
          </button>
        </div>
        {error ? (
          <div className={fstyles.formError} role="alert">
            {error}
          </div>
        ) : null}
      </div>

      <table className={styles.utable}>
        <thead>
          <tr>
            <th>시각</th>
            <th>행위자</th>
            <th>액션</th>
            <th>대상</th>
            <th>레벨</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id}>
              <td className="muted t-sm" style={{ whiteSpace: "nowrap" }}>
                {formatDateTime(r.createdAt)}
              </td>
              <td>
                {r.actorName}
                {r.actorRole ? (
                  <span className="muted t-xs"> · {r.actorRole}</span>
                ) : null}
              </td>
              <td>
                <code className="t-xs">{r.action}</code>
              </td>
              <td className="muted t-sm">
                {r.targetLabel ?? r.targetType ?? "—"}
              </td>
              <td>
                <Tag tone={LEVEL_TONE[r.level] ?? "default"} dot>
                  {LEVEL_LABEL[r.level] ?? r.level}
                </Tag>
              </td>
            </tr>
          ))}
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 20 }}>
                조건에 맞는 로그가 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px"
        }}
      >
        <span className="muted t-xs">
          페이지 {page + 1} / {totalPages}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => void fetchPage(currentFilters(), page - 1)}
            disabled={loading || page <= 0}
          >
            이전
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => void fetchPage(currentFilters(), page + 1)}
            disabled={loading || page + 1 >= totalPages}
          >
            다음
          </button>
        </div>
      </div>
    </section>
  );
}
