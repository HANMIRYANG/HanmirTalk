"use client";

// 프로젝트 설정 워크스페이스 — 4개 섹션:
//   ① 기본 정보 (요약 + 수정 모달 재사용)
//   ② 관련 제품 연결 (relatedProductIds 관리 — 기존에 UI 없던 기능)
//   ③ 채팅방 연동 (연동 방 열기 / 없으면 만들기)
//   ④ 위험 구역 (프로젝트 취소 — 서버는 soft cancel)
// 편집 액션은 canManage 일 때만 렌더. 멤버는 읽기 전용으로 열람.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product, Project } from "@hanmir/shared";
import { Tag } from "@/components/ui/Tag";
import { projectService } from "@/services/project.service";
import { chatService } from "@/services/chat.service";
import { ApiError } from "@/services/api-client";
import { handleSessionExpired } from "@/lib/client-auth";
import { confirmDialog, alertDialog } from "@/components/ui/AppDialogHost";
import { ProjectFormModal } from "../../ProjectFormModal";

interface ProjectSettingsWorkspaceProps {
  project: Project;
  products: Product[];
  linkedRoom: { id: string; name: string } | null;
  canManage: boolean;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "권한이 없습니다.";
    if (err.status === 404) return "대상을 찾을 수 없습니다.";
    if (err.status === 400) return `입력값이 올바르지 않습니다 (${err.message}).`;
    if (err.status === 0) return "서버에 연결할 수 없습니다.";
  }
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export function ProjectSettingsWorkspace({
  project,
  products,
  linkedRoom,
  canManage
}: ProjectSettingsWorkspaceProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [relatedIds, setRelatedIds] = useState<string[]>(project.relatedProductIds ?? []);
  const [productToAdd, setProductToAdd] = useState("");

  const productById = new Map(products.map((p) => [p.id, p] as const));
  const addableProducts = products.filter((p) => !relatedIds.includes(p.id));

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleSessionExpired(router);
        return;
      }
      alertDialog(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveRelated = (nextIds: string[]) =>
    run(async () => {
      await projectService.updateProject(project.id, { relatedProductIds: nextIds });
      setRelatedIds(nextIds);
    });

  const onCreateRoom = () =>
    run(async () => {
      const created = await chatService.createRoom({
        name: `${project.name}`,
        type: "group",
        description: `${project.fullName} 프로젝트 방`,
        projectId: project.id,
        memberIds: project.memberIds
      });
      router.push(`/chat/${created.id}`);
    });

  const onCancelProject = () =>
    run(async () => {
      if (
        !(await confirmDialog(
          `'${project.name}' 프로젝트를 취소할까요?\n상태가 '취소'로 바뀌며 목록에서 진행 중 프로젝트로 표시되지 않습니다. (데이터는 보존)`,
          { danger: true }
        ))
      ) {
        return;
      }
      await projectService.deleteProject(project.id);
      router.push("/projects");
    });

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 860 }}>
      {/* ① 기본 정보 */}
      <section className="card">
        <div className="card__head">
          <h3>기본 정보</h3>
          {canManage ? (
            <button
              type="button"
              className="btn btn--outline btn--sm"
              style={{ marginLeft: "auto" }}
              onClick={() => setEditOpen(true)}
            >
              수정
            </button>
          ) : null}
        </div>
        <div className="card__body" style={{ display: "grid", gap: 6, fontSize: 13 }}>
          <div>
            <b>{project.fullName}</b> <span className="muted">({project.code})</span>
          </div>
          <div className="muted">
            {project.department} · {project.type || "유형 미지정"} · 책임 {project.ownerName}
          </div>
          <div className="muted">
            {project.startDate || "시작일 미정"} ~ {project.dueDate || "마감일 미정"}
            {project.budget ? ` · 예산 ${project.budget}` : ""}
          </div>
          <div className="muted">
            진행률 {project.progress}% (
            {project.progressManual ? "직접 지정" : "업무 완료 기준 자동"})
          </div>
        </div>
      </section>

      {/* ② 관련 제품 연결 */}
      <section className="card">
        <div className="card__head">
          <h3>관련 제품</h3>
          <span className="muted">제품 상세의 &lsquo;관련 프로젝트&rsquo;에 함께 표시됩니다</span>
        </div>
        <div className="card__body" style={{ display: "grid", gap: 8 }}>
          {relatedIds.length === 0 ? (
            <div className="muted t-sm">연결된 제품이 없습니다.</div>
          ) : (
            relatedIds.map((id) => {
              const p = productById.get(id);
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Tag tone="blue">{p?.code || "?"}</Tag>
                  {p ? (
                    <Link href={`/products/${id}`} className="link" style={{ fontSize: 13 }}>
                      {p.name}
                    </Link>
                  ) : (
                    <span className="muted t-sm">삭제된 제품 ({id.slice(0, 8)}…)</span>
                  )}
                  {canManage ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ marginLeft: "auto" }}
                      disabled={busy}
                      onClick={() => void saveRelated(relatedIds.filter((x) => x !== id))}
                    >
                      연결 해제
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
          {canManage ? (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <select
                className="field"
                style={{ flex: 1 }}
                value={productToAdd}
                onChange={(e) => setProductToAdd(e.target.value)}
                disabled={busy || addableProducts.length === 0}
              >
                <option value="">
                  {addableProducts.length === 0 ? "연결할 제품이 없습니다" : "제품 선택…"}
                </option>
                {addableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `[${p.code}] ` : ""}
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busy || !productToAdd}
                onClick={() => {
                  const next = [...relatedIds, productToAdd];
                  setProductToAdd("");
                  void saveRelated(next);
                }}
              >
                연결
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* ③ 채팅방 연동 */}
      <section className="card">
        <div className="card__head">
          <h3>채팅방 연동</h3>
          <span className="muted">연동 방 헤더에 업무/간트/파일 탭이 표시됩니다</span>
        </div>
        <div className="card__body" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {linkedRoom ? (
            <>
              <span style={{ fontSize: 13 }}>
                💬 <b>{linkedRoom.name}</b>
              </span>
              <Link
                href={`/chat/${linkedRoom.id}`}
                className="btn btn--ghost btn--sm"
                style={{ marginLeft: "auto" }}
              >
                채팅방 열기 →
              </Link>
            </>
          ) : (
            <>
              <span className="muted t-sm">연동된 채팅방이 없습니다.</span>
              {canManage ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  style={{ marginLeft: "auto" }}
                  disabled={busy}
                  onClick={() => void onCreateRoom()}
                >
                  {busy ? "만드는 중…" : "연동 채팅방 만들기"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* ④ 위험 구역 */}
      {canManage ? (
        <section className="card" style={{ borderColor: "var(--danger)" }}>
          <div className="card__head">
            <h3 style={{ color: "var(--danger)" }}>위험 구역</h3>
          </div>
          <div className="card__body" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="muted t-sm">
              프로젝트를 취소하면 상태가 &lsquo;취소&rsquo;로 바뀝니다. 업무·마일스톤·결정
              기록은 삭제되지 않고 보존됩니다.
            </div>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              style={{ marginLeft: "auto", color: "var(--danger)", borderColor: "var(--danger)" }}
              disabled={busy}
              onClick={() => void onCancelProject()}
            >
              프로젝트 취소
            </button>
          </div>
        </section>
      ) : null}

      <ProjectFormModal
        open={editOpen}
        mode={{ kind: "edit", project }}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
