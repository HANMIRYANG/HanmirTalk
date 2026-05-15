import type { FileEntry, FileFolder } from "@hanmir/shared";

export const mockFolders: FileFolder[] = [
  { id: "fo-2026", name: "2026년 프로젝트", meta: "128 항목 · 8명 공유", tone: "yellow" },
  { id: "fo-trc", name: "시험성적서 (TRC)", meta: "214 항목 · 품질보증팀", tone: "blue" },
  { id: "fo-sop", name: "표준 양식 / SOP", meta: "76 항목 · 전사 공유", tone: "orange" },
  { id: "fo-notice", name: "전사 공지 자료", meta: "52 항목 · 인사팀", tone: "purple" }
];

export const mockFiles: FileEntry[] = [
  {
    id: "f-1",
    kind: "pdf",
    name: "시험성적서_SUS304_v0.3.pdf",
    scope: "P-2410",
    scopeTone: "blue",
    scopeExtra: { label: "검토중", tone: "amber" },
    size: "2.4 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "오늘 10:24",
    starred: true
  },
  {
    id: "f-2",
    kind: "xls",
    name: "시험성적서_의견정리_v0.3.xlsx",
    scope: "P-2410",
    scopeTone: "blue",
    size: "128 KB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "오늘 13:18"
  },
  {
    id: "f-3",
    kind: "doc",
    name: "P-2410_라인설계_변경요청서.docx",
    scope: "P-2410",
    scopeTone: "blue",
    size: "348 KB",
    uploaderId: "u-yoon-seoyeon",
    uploadedAt: "어제 16:55"
  },
  {
    id: "f-4",
    kind: "ppt",
    name: "2026_5월_경영보고_생산기술.pptx",
    scope: "정기보고",
    size: "5.8 MB",
    uploaderId: "u-kim-minjun",
    uploadedAt: "5월 12일"
  },
  {
    id: "f-5",
    kind: "img",
    name: "결재본_예시_2025-12.png",
    scope: "P-2410",
    scopeTone: "blue",
    size: "316 KB",
    uploaderId: "u-lee-suhyun",
    uploadedAt: "5월 12일"
  },
  {
    id: "f-6",
    kind: "pdf",
    name: "7월_안전교육_이수_안내.pdf",
    scope: "필독 공지",
    scopeTone: "amber",
    size: "412 KB",
    uploaderId: "u-kang-eunhye",
    uploadedAt: "5월 12일"
  },
  {
    id: "f-7",
    kind: "xls",
    name: "SUS304_생산LOT_2026Q2.xlsx",
    scope: "제품정보",
    size: "1.2 MB",
    uploaderId: "u-choi-dohyun",
    uploadedAt: "5월 11일"
  },
  {
    id: "f-8",
    kind: "pdf",
    name: "SOP_자동검사라인_v0.4.pdf",
    scope: "P-2410",
    scopeTone: "blue",
    scopeExtra: { label: "표준양식" },
    size: "3.1 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "5월 10일"
  },
  {
    id: "f-9",
    kind: "zip",
    name: "외주_다온테크_PoC_결과.zip",
    scope: "P-2410",
    scopeTone: "blue",
    size: "38.4 MB",
    uploaderId: "u-yoon-seoyeon",
    uploadedAt: "5월 09일"
  },
  {
    id: "f-10",
    kind: "doc",
    name: "사내_보안정책_개정_v3.2.docx",
    scope: "필독 공지",
    scopeTone: "amber",
    size: "220 KB",
    uploaderId: "u-kang-eunhye",
    uploadedAt: "5월 09일"
  },
  {
    id: "f-11",
    kind: "img",
    name: "라인_설치_사진_20260508.jpg",
    scope: "P-2410",
    scopeTone: "blue",
    size: "2.0 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "5월 08일"
  },
  {
    id: "f-12",
    kind: "pdf",
    name: "시험성적서_SUS304_v0.2.pdf",
    scope: "결재완료",
    scopeTone: "green",
    size: "2.1 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "4월 18일"
  }
];
