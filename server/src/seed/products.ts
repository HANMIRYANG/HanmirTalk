import type { Product } from "@hanmir/shared";

export const seedProducts: Product[] = [
  {
    id: "pr-sus304",
    code: "HM-SUS304-CR",
    name: "SUS304 강판",
    fullName: "SUS304 강판 (Cold Rolled)",
    shortName: "SUS304",
    category: "강판",
    subCategory: "스테인리스 / 냉간압연 / 2B 마감",
    description:
      "냉간압연 SUS304 강판. 인장강도 520 MPa 이상이며 기본 납기는 발주 후 7영업일입니다.",
    features: [
      "내식성 우수, 일반 산업용 SUS 강종 표준",
      "표면 마감 2B/BA/No.4 옵션 제공",
      "KS · ISO 9001 · RoHS 인증 보유"
    ],
    applications: ["식품 가공 설비", "주방 가구", "산업용 외장재"],
    cautions: [
      "시험성적서 v1.0 미확정 상태에서는 신규 견적 시 품질보증팀 결재가 필요합니다.",
      "현재 납기는 기본 +5영업일 적용 중입니다."
    ],
    salesStatus: "conditional",
    salesNote:
      "시험성적서 v1.0 미확정 상태이므로, 신규 고객 견적은 품질보증팀 결재 후 진행 가능합니다. 납기는 기존 대비 +5영업일 적용됩니다.",
    salesUpdatedAt: "2026.05.13 14:02",
    salesUpdatedBy: "최도현 책임",
    ownerId: "u-choi-dohyun",
    imageLabel: "PRODUCT IMG",
    spec: [
      { key: "제품코드", value: "HM-SUS304-CR" },
      { key: "강종", value: "STS304 (UNS S30400) · KS D 3698" },
      { key: "두께 / 폭", value: "0.5 ~ 3.0 mm · 1,219 mm" },
      { key: "표면 마감", value: "2B · BA · No.4 (옵션)" },
      { key: "인장강도", value: "520 MPa 이상" },
      { key: "경도", value: "HV 200 이하" },
      { key: "인증", value: "KS · ISO 9001 · RoHS" },
      { key: "기본 납기", value: "발주 후 7영업일 (현재 +5영업일 적용 중)" },
      { key: "최소 주문 수량", value: "500 kg" }
    ],
    history: [
      // Phase 7 J-1 — new shape (fromStatus/toStatus/reason/changedAt).
      // Deprecated UI 필드(title/meta/date/state)는 mock fallback용으로
      // optional. 새 코드는 toStatus + changedAt + reason만 사용.
      {
        id: "h-1",
        productId: "pr-sus304",
        fromStatus: "preparing",
        toStatus: "available",
        reason: "시험성적서 v0.2 결재 완료 · 일반 영업 진행 가능",
        changedById: "u-park-jiyoung",
        changedByName: "박지영",
        changedAt: "2026-04-18T09:00:00Z",
        // legacy mock 호환
        status: "available",
        title: "영업 가능 (정상)",
        meta: "시험성적서 v0.2 결재 완료 · 일반 영업 진행 가능",
        date: "2026.04.18",
        state: "done"
      },
      {
        id: "h-2",
        productId: "pr-sus304",
        fromStatus: "available",
        toStatus: "conditional",
        reason: "시험성적서 v0.3 의견 반영 중 / 품질보증팀 결재 후 신규 견적 가능 / +5영업일 납기 적용",
        changedById: "u-lee-suhyun",
        changedByName: "이수현",
        changedAt: "2026-05-13T09:00:00Z",
        status: "conditional",
        title: "제한적 영업 가능",
        meta: "시험성적서 v0.3 의견 반영 중 / 품질보증팀 결재 후 신규 견적 가능 / +5영업일 납기 적용",
        date: "2026.05.13",
        state: "current"
      }
    ],
    relatedProjectIds: ["p-2410", "p-2411"],
    documents: [
      { id: "doc-1", kind: "pdf", name: "시험성적서_SUS304_v0.3.pdf", meta: "박지영 · 검토중 · 5/13" },
      { id: "doc-2", kind: "pdf", name: "시험성적서_SUS304_v0.2.pdf", meta: "박지영 · 결재완료 · 4/18" },
      { id: "doc-3", kind: "pdf", name: "시험성적서_SUS304_v0.1.pdf", meta: "박지영 · 결재완료 · 3/22" }
    ],
    quarter: {
      totalKg: "12,840 kg",
      revenue: "₩ 89,640,000",
      avgPrice: "₩ 6,980 / kg",
      topClient: "대성정밀(35%)",
      targetRatio: 72
    }
  }
];
