import type { ActivityEvent } from "@hanmir/shared";

export const mockDashboardActivities: ActivityEvent[] = [
  {
    id: "act-1",
    initials: "박지",
    tone: "orange",
    author: "박지영",
    body: "님이 시험성적서 v0.3을 업로드했습니다.",
    context: "P-2410",
    time: "12분 전"
  },
  {
    id: "act-2",
    initials: "윤서",
    tone: "purple",
    author: "윤서연",
    body: "님이 작업 \"7월 생산일정 초안 작성\"의 담당자로 지정했습니다.",
    context: "P-2411",
    time: "1시간 전"
  },
  {
    id: "act-3",
    initials: "최도",
    author: "최도현",
    body: "님이 SUS304 영업 가능 상태를 \"제한적 영업 가능\"으로 변경했습니다.",
    context: "제품정보",
    time: "2시간 전"
  }
];

export const mockProjectActivities: ActivityEvent[] = [
  {
    id: "pact-1",
    initials: "박지",
    tone: "orange",
    author: "박지영",
    body: "이 시험성적서 v0.3 을 업로드했습니다.",
    context: "",
    time: "12분 전"
  },
  {
    id: "pact-2",
    initials: "이수",
    tone: "purple",
    author: "이수현",
    body: "이 M4 일정에 코멘트를 남겼습니다.",
    context: "",
    time: "1시간 전"
  },
  {
    id: "pact-3",
    initials: "윤",
    tone: "green",
    author: "윤서연",
    body: "이 업무 \"7월 생산일정 초안\"의 마감일을 5월 15일로 변경했습니다.",
    context: "",
    time: "3시간 전"
  },
  {
    id: "pact-4",
    initials: "김민",
    author: "김민준",
    body: "이 M3 마일스톤을 완료 처리했습니다.",
    context: "",
    time: "어제"
  }
];
