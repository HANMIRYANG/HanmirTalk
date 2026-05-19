import type { Product } from "@hanmir/shared";

export const mockProducts: Product[] = [
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
    lots: [
      {
        id: "lot-1",
        number: "L-26-0512-A",
        producedAt: "2026.05.12",
        quantity: "1,820 kg",
        trcVersion: "v0.3 검토중",
        trcStatus: "in_review",
        verdict: "hold",
        note: "v1.0 확정 후 출하 예정"
      },
      {
        id: "lot-2",
        number: "L-26-0509-A",
        producedAt: "2026.05.09",
        quantity: "2,140 kg",
        trcVersion: "v0.2 결재",
        trcStatus: "approved",
        verdict: "pass",
        note: "출하 완료 (대성정밀)"
      },
      {
        id: "lot-3",
        number: "L-26-0505-A",
        producedAt: "2026.05.05",
        quantity: "980 kg",
        trcVersion: "v0.2 결재",
        trcStatus: "approved",
        verdict: "pass",
        note: "출하 완료 (한진금속)"
      },
      {
        id: "lot-4",
        number: "L-26-0428-B",
        producedAt: "2026.04.28",
        quantity: "1,560 kg",
        trcVersion: "v0.1 결재",
        trcStatus: "approved",
        verdict: "pass",
        note: "출하 완료"
      },
      {
        id: "lot-5",
        number: "L-26-0425-A",
        producedAt: "2026.04.25",
        quantity: "820 kg",
        trcVersion: "결과 미확정",
        trcStatus: "pending",
        verdict: "retest",
        note: "표면조도 항목 재측정 필요"
      },
      {
        id: "lot-6",
        number: "L-26-0418-C",
        producedAt: "2026.04.18",
        quantity: "2,200 kg",
        trcVersion: "v0.1 결재",
        trcStatus: "approved",
        verdict: "pass",
        note: "출하 완료"
      }
    ],
    history: [
      {
        id: "h-1",
        toStatus: "available",
        changedAt: "2026.04.18",
        reason: "시험성적서 v0.2 결재 완료 · 일반 영업 진행 가능",
        status: "available",
        title: "영업 가능 (정상)",
        meta: "시험성적서 v0.2 결재 완료 · 일반 영업 진행 가능",
        date: "2026.04.18",
        state: "done"
      },
      {
        id: "h-2",
        toStatus: "conditional",
        fromStatus: "available",
        changedAt: "2026.05.13",
        reason: "시험성적서 v0.3 의견 반영 중 / 품질보증팀 결재 후 신규 견적 가능 / +5영업일 납기 적용",
        status: "conditional",
        title: "제한적 영업 가능",
        meta: "시험성적서 v0.3 의견 반영 중 / 품질보증팀 결재 후 신규 견적 가능 / +5영업일 납기 적용",
        date: "2026.05.13",
        state: "current"
      },
      {
        id: "h-3",
        toStatus: "available",
        changedAt: "예정",
        reason: "시험성적서 v1.0 확정 후 자동 전환 — 예정일 2026.05.20",
        status: "available",
        title: "영업 가능 (정상) 복귀 예정",
        meta: "시험성적서 v1.0 확정 후 자동 전환 — 예정일 2026.05.20",
        date: "예정",
        state: "future"
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

export function findProduct(id: string) {
  return mockProducts.find((p) => p.id === id);
}
