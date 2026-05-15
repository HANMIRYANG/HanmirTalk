import type { Notice } from "@hanmir/shared";

export const seedNotices: Notice[] = [
  {
    id: "n-1",
    title: "[필독] 7월 안전교육 이수 안내",
    body: "7월 사내 안전교육 일정과 이수 기준을 안내드립니다. 5월 20일까지 모든 직원이 확인 후 이수 신청 부탁드립니다.",
    authorTeam: "인사팀",
    createdAt: "2026.05.12",
    dueDate: "2026.05.20",
    isMandatory: true,
    totalRecipients: 342,
    confirmedCount: 218,
    myConfirmed: false,
    tone: "red"
  },
  {
    id: "n-2",
    title: "사내 보안정책 개정 안내(v3.2)",
    body: "사내 정보보안 정책이 v3.2로 개정되었습니다. 변경된 비밀번호 규정과 외부 자료 반출 절차를 확인해 주세요.",
    authorTeam: "정보지원팀",
    createdAt: "2026.05.12",
    isMandatory: true,
    totalRecipients: 342,
    confirmedCount: 286,
    myConfirmed: false,
    tone: "amber"
  },
  {
    id: "n-3",
    title: "한미르톡 v2.4.1 업데이트 안내",
    body: "한미르톡 v2.4.1 업데이트가 배포되었습니다. 주요 변경 사항은 첨부 자료를 참고해 주세요.",
    authorTeam: "정보지원팀",
    createdAt: "2026.05.11",
    isMandatory: false,
    totalRecipients: 342,
    confirmedCount: 305,
    myConfirmed: true,
    tone: "green"
  }
];
