import type {
  ProductDocumentType,
  ProjectStatus,
  SalesStatus,
  TaskPriority,
  TaskStatus,
  UserRole
} from "./types";

export const projectStatusLabel: Record<ProjectStatus, string> = {
  ready: "준비중",
  in_progress: "진행중",
  review: "검토중",
  on_hold: "보류",
  done: "완료",
  cancelled: "중단"
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  todo: "할일",
  in_progress: "진행중",
  review: "검토중",
  done: "완료",
  on_hold: "보류"
};

export const taskPriorityLabel: Record<TaskPriority, string> = {
  top: "최우선",
  high: "높음",
  normal: "보통",
  low: "낮음"
};

export const salesStatusLabel: Record<SalesStatus, string> = {
  unavailable: "불가",
  preparing: "준비중",
  internal: "내부 검토 가능",
  conditional: "제한적 영업 가능",
  available: "정식 영업 가능"
};

// Phase 7 J-2 — 제품 문서 유형 라벨 (docs/06_PRODUCT_INFO_SPEC 8종).
export const productDocumentTypeLabel: Record<ProductDocumentType, string> = {
  catalog: "카탈로그",
  test_report: "시험성적서",
  proposal: "제안서",
  price_sheet: "단가표",
  install_guide: "시공방법서",
  faq: "FAQ",
  certificate: "인증서",
  image: "제품 이미지"
};

export const userRoleLabel: Record<UserRole, string> = {
  super_admin: "슈퍼 관리자",
  admin: "회사 관리자",
  manager: "팀장/책임자",
  project_owner: "프로젝트 책임자",
  member: "일반 사용자"
};
