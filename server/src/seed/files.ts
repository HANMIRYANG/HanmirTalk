import type { FileEntry, FileFolder } from "@hanmir/shared";

// 메모리 모드(dev) 기본 폴더 — 운영의 기본 부서 폴더 구성과 동일한 이름.
// memberIds 는 dev 시드 사용자 id 와 무관하게 비워 둔다 (admin/super_admin
// 은 항상 하위 폴더를 만들 수 있으므로 dev 검증에는 충분).
export const seedFolders: FileFolder[] = [
  "경영지원실",
  "도료사업부",
  "영업본부",
  "연구소"
].map((name, i) => ({
  id: `fo-dept-${i + 1}`,
  name,
  memberIds: [],
  hasPassword: false,
  createdBy: "u-kim-minjun",
  createdAt: "2026-01-01T00:00:00.000Z",
  fileCount: 0,
  childCount: 0
}));

export const seedFiles: FileEntry[] = [
  {
    id: "f-1",
    kind: "pdf",
    name: "시험성적서_SUS304_v0.3.pdf",
    scope: "P-2410",
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
    size: "128 KB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "오늘 13:18"
  },
  {
    id: "f-3",
    kind: "doc",
    name: "P-2410_라인설계_변경요청서.docx",
    scope: "P-2410",
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
    size: "316 KB",
    uploaderId: "u-lee-suhyun",
    uploadedAt: "5월 12일"
  },
  {
    id: "f-6",
    kind: "pdf",
    name: "7월_안전교육_이수_안내.pdf",
    scope: "필독 공지",
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
    size: "3.1 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "5월 10일"
  },
  {
    id: "f-9",
    kind: "zip",
    name: "외주_다온테크_PoC_결과.zip",
    scope: "P-2410",
    size: "38.4 MB",
    uploaderId: "u-yoon-seoyeon",
    uploadedAt: "5월 09일"
  },
  {
    id: "f-10",
    kind: "doc",
    name: "사내_보안정책_개정_v3.2.docx",
    scope: "필독 공지",
    size: "220 KB",
    uploaderId: "u-kang-eunhye",
    uploadedAt: "5월 09일"
  },
  {
    id: "f-11",
    kind: "img",
    name: "라인_설치_사진_20260508.jpg",
    scope: "P-2410",
    size: "2.0 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "5월 08일"
  },
  {
    id: "f-12",
    kind: "pdf",
    name: "시험성적서_SUS304_v0.2.pdf",
    scope: "결재완료",
    size: "2.1 MB",
    uploaderId: "u-park-jiyoung",
    uploadedAt: "4월 18일"
  }
];
