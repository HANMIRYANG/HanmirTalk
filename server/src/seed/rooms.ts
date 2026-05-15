import type { Room } from "@hanmir/shared";

const allMemberIds = [
  "u-park-jiyoung",
  "u-kim-minjun",
  "u-yoon-seoyeon",
  "u-lee-suhyun",
  "u-han-jisu",
  "u-choi-dohyun",
  "u-kang-eunhye",
  "u-jung-minho"
];

export const seedRooms: Room[] = [
  {
    id: "r-p2410",
    name: "P-2410 강판 자동화 라인",
    type: "project",
    projectId: "p-2410",
    members: [
      { userId: "u-park-jiyoung", isOwner: true },
      { userId: "u-kim-minjun", isManager: true },
      { userId: "u-yoon-seoyeon" },
      { userId: "u-lee-suhyun" }
    ],
    unread: 4,
    pinned: true,
    lastMessageAt: "오후 2:14",
    lastMessagePreview: "시험성적서 초안 확인 부탁드립니다.",
    lastMessageAuthor: "박지영 책임",
    avatarLabel: "P1",
    avatarTone: "orange",
    presence: "online",
    presenceUserId: "u-park-jiyoung",
    tag: { label: "프로젝트", tone: "blue" }
  },
  {
    id: "r-prod-eng-team",
    name: "생산기술팀 전체방",
    type: "department",
    members: [
      { userId: "u-park-jiyoung" },
      { userId: "u-kim-minjun" },
      { userId: "u-yoon-seoyeon" },
      { userId: "u-jung-minho", isOwner: true }
    ],
    unread: 8,
    muted: true,
    lastMessageAt: "오후 1:48",
    lastMessagePreview: "내일 9시 라인점검 일정 공유드립니다.",
    lastMessageAuthor: "이수현 수석",
    avatarLabel: "생기",
    avatarTone: "purple",
    presence: "away"
  },
  {
    id: "r-direct-jung",
    name: "정민호 팀장",
    type: "direct",
    members: [{ userId: "u-jung-minho" }, { userId: "u-kim-minjun" }],
    unread: 0,
    muted: true,
    lastMessageAt: "오후 1:02",
    lastMessagePreview: "오전 보고서 확인 후 회신 부탁드립니다.",
    avatarLabel: "정민",
    avatarTone: "default",
    presence: "online"
  },
  {
    id: "r-p2411",
    name: "P-2411 신소재 SPC 도입",
    type: "project",
    projectId: "p-2411",
    members: [{ userId: "u-yoon-seoyeon", isOwner: true }, { userId: "u-kim-minjun" }],
    unread: 2,
    lastMessageAt: "오후 12:33",
    lastMessagePreview: "@김민준 8월 일정 협의 요청드립니다.",
    lastMessageAuthor: "윤서연 책임",
    avatarLabel: "P2",
    avatarTone: "green",
    tag: { label: "진행중", tone: "green" }
  },
  {
    id: "r-announcement",
    name: "전사 공지방",
    type: "announcement",
    members: allMemberIds.map((id) => ({ userId: id })),
    unread: 1,
    lastMessageAt: "오전 11:20",
    lastMessagePreview: "7월 안전교육 이수 안내(필독)",
    lastMessageAuthor: "인사팀",
    avatarLabel: "공지",
    avatarTone: "gray",
    tag: { label: "확인 필요", tone: "amber" }
  },
  {
    id: "r-direct-han",
    name: "한지수 사원",
    type: "direct",
    members: [{ userId: "u-han-jisu" }, { userId: "u-kim-minjun" }],
    unread: 0,
    lastMessageAt: "오전 10:55",
    lastMessagePreview: "네 알겠습니다. 점심 후에 다시 정리해서 드리겠습니다.",
    avatarLabel: "한지",
    avatarTone: "default",
    presence: "online"
  },
  {
    id: "r-sales-prodeng",
    name: "영업본부 ↔ 생산기술",
    type: "group",
    members: [
      { userId: "u-choi-dohyun" },
      { userId: "u-kim-minjun" },
      { userId: "u-park-jiyoung" }
    ],
    unread: 0,
    lastMessageAt: "오전 10:12",
    lastMessagePreview: "SUS304 판재 영업 가능 여부 확인 부탁드립니다.",
    lastMessageAuthor: "최도현 책임",
    avatarLabel: "영업",
    avatarTone: "orange"
  },
  {
    id: "r-p2403",
    name: "P-2403 노후 설비 교체",
    type: "project",
    projectId: "p-2403",
    members: [{ userId: "u-park-jiyoung" }, { userId: "u-kim-minjun" }],
    unread: 0,
    lastMessageAt: "어제",
    lastMessagePreview: "프로젝트가 완료 처리되었습니다.",
    avatarLabel: "P3",
    avatarTone: "purple",
    tag: { label: "완료" }
  },
  {
    id: "r-direct-kang",
    name: "강은혜 수석",
    type: "direct",
    members: [{ userId: "u-kang-eunhye" }, { userId: "u-kim-minjun" }],
    unread: 0,
    lastMessageAt: "어제",
    lastMessagePreview: "자료 확인했습니다. 감사합니다.",
    avatarLabel: "강은",
    avatarTone: "default",
    presence: "off"
  },
  {
    id: "r-quality-team",
    name: "품질보증팀",
    type: "department",
    members: [{ userId: "u-lee-suhyun", isOwner: true }, { userId: "u-han-jisu" }],
    unread: 0,
    lastMessageAt: "5월 8일",
    lastMessagePreview: "시험성적서 미확정 건 5건 회신 부탁드립니다.",
    lastMessageAuthor: "오세훈 책임",
    avatarLabel: "품질",
    avatarTone: "gray"
  }
];
