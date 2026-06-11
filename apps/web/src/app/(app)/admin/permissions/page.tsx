import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { userRoleLabel } from "@hanmir/shared";
import type { UserRole } from "@hanmir/shared";
import { requireServerMe } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import styles from "../admin.module.css";

// Phase 8 K-1 — 권한 / 역할 매트릭스. 코드의 requireRole 가드를 사람이
// 읽을 수 있게 정리한 참고용 표 — 권한 변경은 코드(서버 라우트)에서만
// 이뤄지며 이 페이지는 편집 기능이 없다.
type Access = "manage" | "write" | "read" | "self" | "none";

const ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "manager",
  "project_owner",
  "member"
];

interface AreaRow {
  area: string;
  note: string;
  access: Record<UserRole, Access>;
}

// 모든 직급에 동일하면 한 줄로 줄여 표기.
const all = (a: Access): Record<UserRole, Access> => ({
  super_admin: a,
  admin: a,
  manager: a,
  project_owner: a,
  member: a
});

const MATRIX: AreaRow[] = [
  {
    area: "사용자 · 부서 관리",
    note: "계정 생성/수정/비활성화, 부서 CRUD",
    access: { ...all("none"), super_admin: "manage", admin: "manage" }
  },
  {
    area: "초대 / 가입 승인",
    note: "초대 발급 · 취소",
    access: { ...all("none"), super_admin: "manage", admin: "manage" }
  },
  {
    area: "감사 로그",
    note: "운영 활동 기록 조회",
    access: { ...all("none"), super_admin: "manage", admin: "manage" }
  },
  {
    area: "관리자 대시보드 · 시스템 상태",
    note: "전사 KPI, 서비스 상태/버전",
    access: { ...all("none"), super_admin: "manage", admin: "manage" }
  },
  {
    area: "공지 작성",
    note: "전사 공지 발송 · 확인 현황 조회",
    access: { ...all("none"), super_admin: "manage", admin: "manage" }
  },
  {
    area: "공지 열람 · 확인",
    note: "공지를 읽고 필독 확인 처리",
    access: all("read")
  },
  {
    area: "프로젝트 생성 · 수정",
    note: "프로젝트 CRUD, 멤버 관리 (본인 참여 프로젝트)",
    access: {
      super_admin: "write",
      admin: "write",
      manager: "write",
      project_owner: "write",
      member: "none"
    }
  },
  {
    area: "업무(Task) 생성 · 수정",
    note: "업무 상태/담당자/일정 변경",
    access: {
      super_admin: "write",
      admin: "write",
      manager: "write",
      project_owner: "write",
      member: "none"
    }
  },
  {
    area: "결정사항 기록",
    note: "프로젝트 결정사항 등록/수정",
    access: {
      super_admin: "write",
      admin: "write",
      manager: "write",
      project_owner: "write",
      member: "none"
    }
  },
  {
    area: "제품정보 등록 · 수정",
    note: "제품·사양·문서·영업상태",
    access: {
      super_admin: "write",
      admin: "write",
      manager: "write",
      project_owner: "write",
      member: "none"
    }
  },
  {
    area: "채팅 · 메시지",
    note: "본인이 멤버인 채팅방에서 송수신",
    access: all("write")
  },
  {
    area: "파일 업로드 · 다운로드",
    note: "화이트리스트 확장자 한정",
    access: all("write")
  },
  {
    area: "본인 계정 · 알림 설정",
    note: "비밀번호 변경, 알림 채널 설정",
    access: all("self")
  }
];

const ACCESS_META: Record<
  Access,
  { label: string; tone: "red" | "blue" | "green" | "amber" | "default" } | null
> = {
  manage: { label: "관리", tone: "red" },
  write: { label: "쓰기", tone: "blue" },
  read: { label: "읽기", tone: "green" },
  self: { label: "본인", tone: "amber" },
  none: null
};

function AccessCell({ value }: { value: Access }) {
  const meta = ACCESS_META[value];
  if (!meta) return <span className="muted">—</span>;
  return <Tag tone={meta.tone}>{meta.label}</Tag>;
}

export default async function AdminPermissionsPage() {
  await requireServerMe();

  return (
    <>
      <Topbar title="권한 / 역할" sub="역할별 접근 권한 매트릭스" />

      <section className={styles.ahead}>
        <h1>권한 / 역할</h1>
        <div className={styles.aheadSub}>
          직급(역할)별 기능 접근 범위입니다. 권한은 서버 코드에서 관리되며 이
          표는 참고용입니다.
        </div>
      </section>

      <div className={cn("content", styles.content)}>
        <section className="card">
          <div className="card__head">
            <h3>역할별 접근 권한</h3>
          </div>
          <table className={styles.utable}>
            <thead>
              <tr>
                <th>기능 영역</th>
                {ROLES.map((r) => (
                  <th key={r} style={{ textAlign: "center" }}>
                    {userRoleLabel[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.area}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.area}</div>
                    <div className="muted t-xs">{row.note}</div>
                  </td>
                  {ROLES.map((r) => (
                    <td key={r} style={{ textAlign: "center" }}>
                      <AccessCell value={row.access[r]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted t-xs" style={{ padding: "12px 16px" }}>
            범례 — <b>관리</b>: 전체 CRUD · <b>쓰기</b>: 생성/수정 · <b>읽기</b>:
            조회만 · <b>본인</b>: 본인 데이터 한정 · <b>—</b>: 접근 불가.
            현재 코드에서 슈퍼 관리자와 회사 관리자는 동일한 권한을 가집니다.
          </div>
        </section>
      </div>
    </>
  );
}
