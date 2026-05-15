import type { Project } from "@hanmir/shared";

export const seedProjects: Project[] = [
  {
    id: "p-2410",
    code: "P-2410",
    name: "강판 자동화 라인",
    fullName: "강판 자동화 라인 도입 (Phase 2)",
    status: "in_progress",
    stageLabel: "실행 단계",
    department: "생산기술팀",
    ownerName: "박지영 책임",
    startDate: "2026.03.04",
    dueDate: "2026.08.30",
    progress: 62,
    taskCounts: { done: 15, inProgress: 6, pending: 3, total: 24 },
    delayedCount: 2,
    description:
      "제2공장 강판 가공 라인의 자동화 도입 2단계 프로젝트입니다. 기존 반자동 라인을 SPC 기반 자동 검사 라인으로 전환하여 인장강도 측정과 표면조도 측정 공정의 표준화를 목표로 합니다.",
    goals: [
      "SUS304 / SUS316 강종 자동 검사 라인 도입",
      "시험성적서 발급 리드타임 평균 3.2일 → 1.0일 단축",
      "품질 데이터 SPC 시스템 연동 (한미르 ERP 연계)",
      "영업본부 영업 가능 상태 자동 갱신 연동"
    ],
    outputs: [
      "시험성적서 표준 양식 v1.0 확정",
      "자동 검사 라인 SOP 문서",
      "운영 인력 교육자료 및 이수 기록"
    ],
    memberIds: [
      "u-park-jiyoung",
      "u-kim-minjun",
      "u-yoon-seoyeon",
      "u-lee-suhyun",
      "u-choi-dohyun"
    ],
    budget: "₩ 480,000,000",
    type: "설비도입 / Phase 2",
    externalPartners: "다온테크 / 신원오토메이션",
    relatedProductIds: ["pr-sus304"],
    salesStatus: "conditional",
    milestones: [
      {
        id: "ms-1",
        title: "M1. 요구사항 정의 및 사양 확정",
        subtitle: "박지영 · 생산기술팀 / 결재 완료",
        date: "2026.03.20",
        status: "done"
      },
      {
        id: "ms-2",
        title: "M2. 라인 설계 및 BOM 확정",
        subtitle: "윤서연 · 생산기술팀",
        date: "2026.04.18",
        status: "done"
      },
      {
        id: "ms-3",
        title: "M3. 시험 운영 및 시험성적서 작성",
        subtitle: "박지영 · 김민준 / 시험성적서 v0.2 결재 완료",
        date: "2026.05.06",
        status: "done"
      },
      {
        id: "ms-4",
        title: "M4. 시험성적서 v1.0 확정 및 결재",
        subtitle: "김민준 · 이수현 / 시험성적서 v0.3 검토 중 · 지연 1일",
        date: "2026.05.14",
        status: "delayed"
      },
      {
        id: "ms-5",
        title: "M5. 라인 본가동 및 운영 인력 교육",
        subtitle: "제조1팀 · 외주(다온테크) 협업",
        date: "2026.07.10",
        status: "pending"
      },
      {
        id: "ms-6",
        title: "M6. 최종 검수 및 프로젝트 종료",
        subtitle: "박지영 책임",
        date: "2026.08.30",
        status: "pending"
      }
    ]
  },
  {
    id: "p-2411",
    code: "P-2411",
    name: "신소재 SPC 도입",
    fullName: "신소재 SPC 도입",
    status: "in_progress",
    stageLabel: "기획 단계",
    department: "생산기술팀",
    ownerName: "윤서연 책임",
    startDate: "2026.04.10",
    dueDate: "2026.09.15",
    progress: 38,
    taskCounts: { done: 6, inProgress: 4, pending: 5, total: 15 },
    delayedCount: 0,
    description: "신소재 SPC 도입을 위한 기획·시제품 단계 프로젝트입니다.",
    goals: ["신소재 적용 가능성 검토", "샘플 제작 및 시험 결과 확보"],
    outputs: ["적용 검토 보고서"],
    memberIds: ["u-yoon-seoyeon", "u-kim-minjun", "u-han-jisu"],
    budget: "₩ 120,000,000",
    type: "신제품 도입",
    salesStatus: "internal",
    milestones: []
  },
  {
    id: "p-2403",
    code: "P-2403",
    name: "노후 설비 교체",
    fullName: "노후 설비 교체",
    status: "done",
    stageLabel: "완료",
    department: "생산기술팀",
    ownerName: "정민호 팀장",
    startDate: "2025.10.01",
    dueDate: "2026.04.30",
    progress: 100,
    taskCounts: { done: 28, inProgress: 0, pending: 0, total: 28 },
    delayedCount: 0,
    description: "제2공장 노후 설비 교체 프로젝트.",
    goals: ["노후 설비 5종 교체"],
    outputs: ["교체 완료 보고서"],
    memberIds: ["u-jung-minho", "u-park-jiyoung"],
    salesStatus: "available",
    milestones: []
  }
];
