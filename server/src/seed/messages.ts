import type { ChatMessage } from "@hanmir/shared";

export const seedMessages: Record<string, ChatMessage[]> = {
  "r-p2410": [
    {
      id: "m-sys-1",
      roomId: "r-p2410",
      authorId: "system",
      authorName: "시스템",
      initials: "",
      body: "김민준 책임님이 윤서연 책임님을 초대했습니다.",
      createdAt: "2026-05-13T09:00:00",
      isSystem: true
    },
    {
      id: "m-1",
      roomId: "r-p2410",
      authorId: "u-park-jiyoung",
      authorName: "박지영",
      authorRole: "책임 · 생산기술팀",
      avatarTone: "orange",
      initials: "박지",
      body:
        "안녕하세요 여러분.\n어제 합의된 라인 변경 사양 반영해서 시험성적서 v0.3 공유드립니다.\n검토 의견 부탁드려요.",
      createdAt: "오전 10:24",
      attachment: {
        id: "a-1",
        kind: "pdf",
        name: "시험성적서_SUS304_v0.3.pdf",
        meta: "2.4 MB · 12페이지 · 오전 10:24"
      },
      reactions: [
        { emoji: "👍", count: 5 },
        { emoji: "✅", count: 3 }
      ],
      threadReplyCount: 4,
      threadLastReplyAt: "12분 전",
      threadReplyAvatars: [
        { initials: "윤", tone: "green" },
        { initials: "김", tone: "default" },
        { initials: "이", tone: "purple" }
      ]
    },
    {
      id: "m-2",
      roomId: "r-p2410",
      authorId: "u-yoon-seoyeon",
      authorName: "윤서연",
      authorRole: "책임 · 생산기술팀",
      avatarTone: "green",
      initials: "윤",
      body:
        "박책임님 감사합니다. p.7 인장강도 시험 결과값 단위가 N/mm² 인지 MPa 인지 통일이 필요해 보입니다.\n저희 표준은 MPa 사용 중이라 통일해 두는 게 좋을 것 같아요.",
      createdAt: "오전 10:48"
    },
    {
      id: "m-3",
      roomId: "r-p2410",
      authorId: "u-yoon-seoyeon",
      authorName: "윤서연",
      authorRole: "책임 · 생산기술팀",
      avatarTone: "green",
      initials: "윤",
      body: "그리고 시험일자 표기도 YYYY.MM.DD 로 통일 부탁드립니다.",
      createdAt: "오전 10:51",
      groupedWithPrev: true
    },
    {
      id: "m-4",
      roomId: "r-p2410",
      authorId: "u-kim-minjun",
      authorName: "김민준",
      authorRole: "책임 · 생산기술팀 · 나",
      initials: "김민",
      body:
        "@박지영 책임님, 저는 4페이지 표면조도 항목에서 측정기 기종 명기가 빠져있는 것 같아 추가 부탁드립니다.\n그리고 영업본부에서 SUS304 영업 가능 상태가 \"제한적 영업 가능\"으로 변경되었다고 하니, 시험성적서에도 비고로 표기되어야 할 것 같습니다.",
      createdAt: "오후 1:02",
      mentions: ["박지영"],
      isMine: true
    },
    {
      id: "m-5",
      roomId: "r-p2410",
      authorId: "u-park-jiyoung",
      authorName: "박지영",
      authorRole: "책임 · 생산기술팀",
      avatarTone: "orange",
      initials: "박지",
      body:
        "두 분 의견 반영해서 v0.4 작성하겠습니다.\n판정 일자: 5/14(목) 오전 회의에서 최종 확정 → 영업본부 공유 순으로 진행하면 어떨까요?",
      createdAt: "오후 1:18",
      attachment: {
        id: "a-2",
        kind: "xls",
        name: "시험성적서_의견정리_v0.3.xlsx",
        meta: "128 KB · 오후 1:18"
      }
    },
    {
      id: "m-6",
      roomId: "r-p2410",
      authorId: "u-lee-suhyun",
      authorName: "이수현",
      authorRole: "수석 · 품질보증팀",
      avatarTone: "purple",
      initials: "이수",
      body:
        "좋습니다. 품질팀에서는 의견 없으며 v0.4 받는 즉시 결재 상신 진행하겠습니다.\n참고로 동일 강종 다른 호기 시험성적서는 첨부 이미지처럼 결재된 사례 공유드립니다.",
      createdAt: "오후 2:14",
      attachment: {
        id: "a-3",
        kind: "img",
        name: "결재본_예시_2025-12.png",
        meta: "316 KB · 오후 2:14"
      },
      reactions: [{ emoji: "👍", count: 2 }]
    }
  ]
};

export const seedPinnedMessages: Record<string, { author: string; body: string }> = {
  "r-p2410": {
    author: "박지영 책임",
    body: "시험성적서 v0.3 검토 의견은 5/14(목) 18시까지 회신 부탁드립니다."
  }
};
