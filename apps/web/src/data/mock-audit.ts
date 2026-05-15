import type { AdminKpi, AuditEntry } from "@hanmir/shared";

export const mockKpis: AdminKpi[] = [
  { label: "전체 사용자", value: "342", sub: "활성 318 · 휴직 18 · 퇴직 6" },
  { label: "오늘 접속 사용자", value: "268", sub: "어제 대비 ▲ 3.2%" },
  { label: "진행 중인 프로젝트", value: "24", sub: "신규 3 · 이번 주" },
  { label: "스토리지 사용량", value: "142 GB", sub: "한도 500 GB · 28%", progress: 28 },
  { label: "보안 알림", value: "2", sub: "신규 로그인 위치 1건 · 권한 변경 1건", highlight: "warn" }
];

export const mockAudit: AuditEntry[] = [
  {
    id: "au-1",
    title: "새로운 기기에서 로그인 — 정민호 팀장",
    meta: "IP 211.45.xx.xx · Chrome / Windows · 서울",
    time: "23분 전",
    level: "warn"
  },
  {
    id: "au-2",
    title: "권한 변경 — 최도현 책임 에게 \"제품정보 편집자\" 부여",
    meta: "관리자: 정민호 팀장",
    time: "1시간 전",
    level: "danger"
  },
  {
    id: "au-3",
    title: "전사 공지 발송 — \"7월 안전교육 이수 안내\"",
    meta: "인사팀 · 발송 대상 342명 · 필독",
    time: "3시간 전",
    level: "info"
  }
];

export const mockDeptStats: { name: string; sub: string; count: string }[] = [
  { name: "생산기술팀", sub: "프로젝트 12 · 멤버 48", count: "48" },
  { name: "품질보증팀", sub: "프로젝트 9 · 멤버 32", count: "32" },
  { name: "영업본부 1팀", sub: "거래처 122 · 멤버 26", count: "26" },
  { name: "인사팀", sub: "공지 58 · 멤버 12", count: "12" },
  { name: "자재팀", sub: "입고 1,240 · 멤버 18", count: "18" }
];
