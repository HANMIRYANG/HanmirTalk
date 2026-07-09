// PPTX 텍스트/이미지 추출 — jszip 기반 결정적 파서 (AI 무관).
//
// PPTX 는 XML 묶음 ZIP 이다: 슬라이드 본문은 ppt/slides/slideN.xml 의
// <a:t> 텍스트 런, 표는 <a:tbl>, 이미지는 슬라이드 rels 를 거쳐
// ppt/media/* 를 가리킨다. 여기서는 DOM 파서 없이 정규식으로 필요한
// 조각만 꺼낸다 — OOXML 네임스페이스 접두사(a:)는 표준 고정이고,
// 추출 대상이 텍스트 런·관계 목록뿐이라 구조 파싱이 필요 없다.
//
// 실패 정책: zip 이 안 열리거나 슬라이드 XML 이 하나도 없으면
// Error("invalid_pptx") — 업로드 라우트가 422 로 변환해 재업로드를
// 유도한다. 개별 슬라이드가 텍스트 없이 비는 것은 정상.
import JSZip from "jszip";

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// 한 XML 조각 안의 <a:t> 런을 이어붙인다. 런은 서식 단위 분절이라
// 구분자 없이 연결해야 원문이 복원된다.
function textRuns(xml: string): string {
  const out: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(decodeEntities(m[1]));
  return out.join("");
}

// 슬라이드 XML 하나 → 읽을 수 있는 텍스트. 표(<a:tbl>)를 먼저 행 단위
// (셀 " | " 구분)로 뽑아 제거한 뒤, 남은 문단(<a:p>)별로 런을 연결한다.
function slideToText(xml: string): string {
  const lines: string[] = [];
  const withoutTables = xml.replace(/<a:tbl(?:\s[^>]*)?>[\s\S]*?<\/a:tbl>/g, (tbl) => {
    const rowRe = /<a:tr(?:\s[^>]*)?>([\s\S]*?)<\/a:tr>/g;
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(tbl)) !== null) {
      const cells: string[] = [];
      const cellRe = /<a:tc(?:\s[^>]*)?>([\s\S]*?)<\/a:tc>/g;
      let cell: RegExpExecArray | null;
      while ((cell = cellRe.exec(row[1])) !== null) {
        cells.push(textRuns(cell[1]).trim());
      }
      if (cells.some((c) => c.length > 0)) lines.push(cells.join(" | "));
    }
    return ""; // 표 텍스트가 아래 문단 추출에서 중복되지 않게 제거
  });
  const paraRe = /<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g;
  let para: RegExpExecArray | null;
  while ((para = paraRe.exec(withoutTables)) !== null) {
    const text = textRuns(para[1]).trim();
    if (text.length > 0) lines.push(text);
  }
  return lines.join("\n");
}

// 슬라이드 파일명 목록을 발표 순서로 정렬한다. 정순은
// ppt/presentation.xml 의 <p:sldIdLst> r:id 순서를 rels 로 해석한 것 —
// 슬라이드를 재배치한 덱도 올바른 순서가 나온다. 어느 한쪽이라도
// 파싱이 안 되면 slideN 숫자 정렬로 폴백.
async function orderedSlideNames(zip: JSZip): Promise<string[]> {
  const slideNames = Object.keys(zip.files).filter((n) => SLIDE_RE.test(n));
  const numericSort = slideNames.sort(
    (a, b) => Number(a.match(SLIDE_RE)![1]) - Number(b.match(SLIDE_RE)![1])
  );
  try {
    const relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
    const presXml = await zip.file("ppt/presentation.xml")?.async("string");
    if (!relsXml || !presXml) return numericSort;
    const relTargets = new Map<string, string>();
    const relRe = /<Relationship\s[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"[^>]*?\/?>/g;
    let rel: RegExpExecArray | null;
    while ((rel = relRe.exec(relsXml)) !== null) {
      relTargets.set(rel[1], rel[2].replace(/^\/?(ppt\/)?/, "ppt/"));
    }
    const ordered: string[] = [];
    const sldRe = /<p:sldId\s[^>]*?r:id="([^"]+)"[^>]*?\/?>/g;
    let sld: RegExpExecArray | null;
    while ((sld = sldRe.exec(presXml)) !== null) {
      const target = relTargets.get(sld[1]);
      if (target && SLIDE_RE.test(target)) ordered.push(target);
    }
    // sldIdLst 가 슬라이드 전부를 커버할 때만 신뢰한다.
    return ordered.length === slideNames.length ? ordered : numericSort;
  } catch {
    return numericSort;
  }
}

async function loadZip(buffer: Buffer): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("invalid_pptx");
  }
}

// 전체 텍스트 추출 — "[슬라이드 N]" 헤더 아래 슬라이드별 본문.
export async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await loadZip(buffer);
  const slides = await orderedSlideNames(zip);
  if (slides.length === 0) throw new Error("invalid_pptx");
  const parts: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(slides[i])!.async("string");
    const text = slideToText(xml);
    parts.push(`[슬라이드 ${i + 1}]${text ? `\n${text}` : "\n(텍스트 없음)"}`);
  }
  return parts.join("\n\n");
}

export interface PptxImage {
  name: string; // zip 내 경로 (예: "ppt/media/image3.png")
  mimeType: string;
  data: Buffer;
  slideNo: number; // 1-base 발표 순서
}

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

// Gemini 판독용 상한 — 주간보고 덱 기준 여유값. 초과분은 조용히 버리지
// 않고 개수만 잘라 앞쪽(발표 순) 우선.
const MAX_IMAGES = 16;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// 슬라이드에 배치된 이미지(엑셀 캡처 등)를 발표 순서로 추출한다.
// gif/emf/wmf 등 미지원 포맷은 제외. 실패는 빈 배열이 아니라 throw —
// 호출부(stepSummarize)가 best-effort try/catch 로 감싼다.
export async function extractPptxImages(buffer: Buffer): Promise<PptxImage[]> {
  const zip = await loadZip(buffer);
  const slides = await orderedSlideNames(zip);
  const seen = new Set<string>();
  const images: PptxImage[] = [];
  for (let i = 0; i < slides.length && images.length < MAX_IMAGES; i++) {
    const relsName = slides[i].replace(
      /^ppt\/slides\/(slide\d+\.xml)$/,
      "ppt/slides/_rels/$1.rels"
    );
    const relsXml = await zip.file(relsName)?.async("string");
    if (!relsXml) continue;
    const relRe =
      /<Relationship\s[^>]*?Type="[^"]*\/image"[^>]*?Target="([^"]+)"[^>]*?\/?>/g;
    let rel: RegExpExecArray | null;
    while ((rel = relRe.exec(relsXml)) !== null && images.length < MAX_IMAGES) {
      const mediaPath = rel[1].replace(/^(\.\.\/|\/)+/, "ppt/");
      if (seen.has(mediaPath)) continue;
      seen.add(mediaPath);
      const ext = (mediaPath.split(".").pop() ?? "").toLowerCase();
      const mimeType = IMAGE_MIME[ext];
      if (!mimeType) continue;
      const file = zip.file(mediaPath);
      if (!file) continue;
      const data = await file.async("nodebuffer");
      if (data.length === 0 || data.length > MAX_IMAGE_BYTES) continue;
      images.push({ name: mediaPath, mimeType, data, slideNo: i + 1 });
    }
  }
  return images;
}
