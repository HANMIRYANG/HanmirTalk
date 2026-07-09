// DOCX 생성 — ① 정리된 회의록 ② 전사 전문. 한글 호환을 위해 문서 기본
// 폰트는 "맑은 고딕"(사내 Windows 표준). 폰트는 이름만 임베드되므로 열람
// PC 에 설치돼 있어야 한다.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import type { Meeting, MeetingMinutesData } from "@hanmir/shared";

const FONT = "맑은 고딕";

// KST 표기 — 서버 컨테이너는 UTC 라 수동 +9h. (timestamptz 미사용 스택과
// 동일하게 앱 레이어에서 KST 처리하는 기존 관례.)
export function formatKst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function formatKstDate(iso: string): string {
  return formatKst(iso).slice(0, 10).replace(/-/g, "");
}

export function formatDuration(durationMs: number): string {
  const totalMin = Math.round(durationMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function baseDocument(children: (Paragraph | Table)[]): Document {
  return new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } }, // 11pt (half-points)
        heading1: { run: { font: FONT, size: 32, bold: true } },
        heading2: { run: { font: FONT, size: 26, bold: true } }
      }
    },
    sections: [{ children }]
  });
}

function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 240 },
    children: [new TextRun(text)]
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun(text)]
  });
}

function para(
  text: string,
  opts?: { bullet?: boolean; muted?: boolean; label?: boolean }
): Paragraph {
  return new Paragraph({
    spacing: { before: opts?.label ? 120 : undefined, after: 80 },
    bullet: opts?.bullet ? { level: 0 } : undefined,
    children: [
      new TextRun({
        text,
        bold: opts?.label || undefined,
        color: opts?.muted ? "666666" : undefined,
        size: opts?.muted ? 18 : undefined
      })
    ]
  });
}

function cell(text: string, opts?: { bold?: boolean; widthPct?: number }): TableCell {
  return new TableCell({
    width: opts?.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({ children: [new TextRun({ text, bold: opts?.bold })] })
    ]
  });
}

function fullWidthTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "cccccc" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "cccccc" }
    },
    rows
  });
}

// ① 정리된 회의록. structured 가 null(파싱 실패)이면 Claude 원문 폴백 렌더
// — 파싱 실패가 파이프라인 실패가 되지 않게.
export async function buildMinutesDocx(
  meeting: Meeting,
  structured: MeetingMinutesData | null,
  fallbackText: string
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [heading1(`${meeting.title} — 회의록`)];

  const when = meeting.endedAt
    ? `${formatKst(meeting.startedAt)} ~ ${formatKst(meeting.endedAt).slice(11)}`
    : formatKst(meeting.startedAt);
  children.push(
    fullWidthTable([
      new TableRow({ children: [cell("일시", { bold: true, widthPct: 20 }), cell(`${when} (KST)`)] }),
      new TableRow({ children: [cell("회의명", { bold: true }), cell(meeting.title)] }),
      new TableRow({
        children: [cell("소요 시간", { bold: true }), cell(formatDuration(meeting.durationMs))]
      }),
      new TableRow({
        children: [
          cell("참석자", { bold: true }),
          cell(structured ? structured.attendees.join(", ") : "(전사 참조)")
        ]
      })
    ])
  );

  if (structured) {
    children.push(heading2("1. 회의 개요"));
    children.push(para(structured.overview));

    // 부서별 섹션 — 부서마다 안건 토픽(한 줄씩) → 결정사항 → 피드백 순.
    // 부서 구분은 업로드된 주간보고 PPT 기준 (없으면 전사에서 추론된 것).
    children.push(heading2("2. 부서별 보고 및 논의"));
    if (structured.departments.length === 0) children.push(para("(없음)"));
    structured.departments.forEach((dep, i) => {
      children.push(
        new Paragraph({
          spacing: { before: i === 0 ? 0 : 240, after: 100 },
          children: [new TextRun({ text: `2.${i + 1} ${dep.name}`, bold: true, size: 24 })]
        })
      );
      children.push(para("▸ 안건", { label: true }));
      if (dep.topics.length === 0) children.push(para("(없음)"));
      for (const t of dep.topics) children.push(para(t, { bullet: true }));
      children.push(para("▸ 결정사항", { label: true }));
      if (dep.decisions.length === 0) children.push(para("(없음)"));
      dep.decisions.forEach((d, n) => children.push(para(`${n + 1}. ${d}`)));
      children.push(para("▸ 피드백", { label: true }));
      if (dep.feedback.length === 0) children.push(para("(없음)"));
      for (const f of dep.feedback) children.push(para(f, { bullet: true }));
    });

    children.push(heading2("3. 액션아이템"));
    if (structured.actionItems.length === 0) {
      children.push(para("(없음)"));
    } else {
      children.push(
        fullWidthTable([
          new TableRow({
            children: [
              cell("담당", { bold: true, widthPct: 20 }),
              cell("내용", { bold: true, widthPct: 60 }),
              cell("기한", { bold: true, widthPct: 20 })
            ]
          }),
          ...structured.actionItems.map(
            (item) =>
              new TableRow({
                children: [cell(item.assignee), cell(item.item), cell(item.due)]
              })
          )
        ])
      );
    }
  } else {
    // 구조화 파싱 실패 — 원문 그대로 (코드펜스 마커만 제거)
    children.push(heading2("회의록"));
    const cleaned = fallbackText.replace(/```(json)?/g, "").trim();
    for (const line of cleaned.split("\n")) children.push(para(line));
  }

  children.push(
    new Paragraph({
      spacing: { before: 360 },
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: "본 회의록은 AI 전사·요약으로 생성되었습니다.", color: "888888", size: 16 })
      ]
    })
  );

  return Packer.toBuffer(baseDocument(children));
}

// ② 전사 전문 — 화자·타임스탬프 포함.
export async function buildTranscriptDocx(
  meeting: Meeting,
  transcriptText: string
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    heading1(`${meeting.title} — 전사 전문`),
    para(`일시: ${formatKst(meeting.startedAt)} (KST) · 소요 ${formatDuration(meeting.durationMs)}`),
    para("타임스탬프는 근사치이며, 화자 구분(화자1/화자2)은 AI 추정입니다.", { muted: true })
  ];
  for (const line of transcriptText.split("\n")) {
    children.push(para(line));
  }
  return Packer.toBuffer(baseDocument(children));
}
