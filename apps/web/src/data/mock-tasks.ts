import type { TaskItem } from "@hanmir/shared";

export const mockTasks: TaskItem[] = [
  // 지연
  {
    id: "t-1024",
    code: "T-1024",
    projectId: "p-2410",
    title: "시험성적서 v0.3 검토 회신",
    status: "in_progress",
    priority: "top",
    assigneeIds: ["u-park-jiyoung", "u-kim-minjun"],
    dueLabel: "⚠ 5월 12일 (1일 지연)",
    dueState: "late",
    delayDays: 1,
    progress: 80,
    subtaskCount: 3,
    isGroupedAsDelayed: true
  },
  {
    id: "t-1031",
    code: "T-1031",
    projectId: "p-2410",
    title: "시험성적서 비고란 영업상태 반영",
    status: "in_progress",
    priority: "high",
    assigneeIds: ["u-yoon-seoyeon"],
    dueLabel: "⚠ 5월 11일 (2일 지연)",
    dueState: "late",
    delayDays: 2,
    progress: 25,
    isGroupedAsDelayed: true
  },
  // 진행중
  {
    id: "t-1042",
    code: "T-1042",
    projectId: "p-2410",
    title: "7월 생산일정 초안 작성",
    status: "in_progress",
    priority: "high",
    assigneeIds: ["u-kim-minjun"],
    dueLabel: "오늘 18:00",
    dueState: "today",
    progress: 45
  },
  {
    id: "t-1045",
    code: "T-1045",
    projectId: "p-2410",
    title: "자동검사기 작동 매뉴얼 1차 작성",
    status: "in_progress",
    priority: "normal",
    assigneeIds: ["u-park-jiyoung", "u-lee-suhyun"],
    dueLabel: "5월 17일",
    dueState: "normal",
    progress: 60
  },
  {
    id: "t-1047",
    code: "T-1047",
    projectId: "p-2410",
    title: "외주(다온테크) PoC 결과 정리",
    status: "in_progress",
    priority: "normal",
    assigneeIds: ["u-yoon-seoyeon"],
    dueLabel: "5월 19일",
    dueState: "normal",
    progress: 30
  },
  {
    id: "t-1048",
    code: "T-1048",
    projectId: "p-2410",
    title: "설비점검 체크리스트 결재 상신",
    status: "in_progress",
    priority: "normal",
    assigneeIds: ["u-lee-suhyun"],
    dueLabel: "5월 14일",
    dueState: "normal",
    progress: 75
  },
  {
    id: "t-1050",
    code: "T-1050",
    projectId: "p-2410",
    title: "월간 KPI 리뷰 자료 정리",
    status: "in_progress",
    priority: "low",
    assigneeIds: ["u-kim-minjun"],
    dueLabel: "5월 16일",
    dueState: "normal",
    progress: 20
  },
  {
    id: "t-1052",
    code: "T-1052",
    projectId: "p-2410",
    title: "SOP 표준양식 v1.0 초안",
    status: "in_progress",
    priority: "normal",
    assigneeIds: ["u-park-jiyoung"],
    dueLabel: "5월 21일",
    dueState: "normal",
    progress: 10
  },
  // 대기
  {
    id: "t-1058",
    code: "T-1058",
    projectId: "p-2410",
    title: "현장 작업자 교육자료 작성",
    status: "todo",
    priority: "normal",
    assigneeIds: [],
    dueLabel: "5월 27일",
    dueState: "normal",
    progress: 0
  },
  {
    id: "t-1060",
    code: "T-1060",
    projectId: "p-2410",
    title: "ERP 연동 인터페이스 정의서",
    status: "todo",
    priority: "normal",
    assigneeIds: ["u-yoon-seoyeon"],
    dueLabel: "6월 03일",
    dueState: "normal",
    progress: 0
  },
  {
    id: "t-1061",
    code: "T-1061",
    projectId: "p-2410",
    title: "자동검사기 검수 일정 협의",
    status: "todo",
    priority: "low",
    assigneeIds: ["u-park-jiyoung"],
    dueLabel: "6월 10일",
    dueState: "normal",
    progress: 0
  }
];

export function tasksByProject(projectId: string) {
  return mockTasks.filter((t) => t.projectId === projectId);
}
