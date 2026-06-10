"use client";

import type { ChatMessage } from "@hanmir/shared";
import styles from "../MessageItem.module.css";

// Phase 5 H-2b + Phase 10 — entities 사이 plain text segment 에만
// 마크다운(`**bold**`, `*italic*`, 줄 시작 `- `) 을 적용한다. entity
// 안에서는 파싱하지 않아 멘션 표시가 흐트러지지 않음. 삭제된 메시지는
// body 가 마스킹 텍스트("삭제된 메시지입니다") 라 매칭이 없어 자연히
// 평범한 텍스트로 렌더된다. dangerouslySetInnerHTML 사용 금지 —
// React node 트리만 반환.
export function renderMessageBody(message: ChatMessage) {
  const { body, entities, mentions } = message;
  if (entities && entities.length > 0) {
    const sorted = [...entities].sort((a, b) => a.offset - b.offset);
    const out: (string | JSX.Element)[] = [];
    let cursor = 0;
    let key = 0;
    sorted.forEach((e, i) => {
      if (e.offset < cursor) return; // overlap → skip
      if (e.offset > cursor) {
        out.push(
          ...renderMarkdownSegment(body.slice(cursor, e.offset), `e${i}p`)
        );
      }
      const tokenText = body.slice(e.offset, e.offset + e.length);
      const cls = e.type === "mention" ? styles.mention : styles.entityRef;
      out.push(
        <span key={`ent-${i}`} className={cls} title={e.label}>
          {tokenText}
        </span>
      );
      cursor = e.offset + e.length;
      key += 1;
    });
    if (cursor < body.length) {
      out.push(...renderMarkdownSegment(body.slice(cursor), `e${key}t`));
    }
    return out;
  }
  // Legacy mentions[] fallback — 서버가 entities 를 비워 보낸 시드 데이터.
  // 마크다운은 동일하게 적용하되, 멘션 토큰만 강조한다.
  if (mentions && mentions.length > 0) {
    const out: (string | JSX.Element)[] = [];
    let remaining = body;
    let key = 0;
    for (const name of mentions) {
      const token = `@${name}`;
      const idx = remaining.indexOf(token);
      if (idx === -1) continue;
      if (idx > 0) out.push(...renderMarkdownSegment(remaining.slice(0, idx), `lm${key}p`));
      out.push(
        <span key={`lm-${key}`} className={styles.mention}>
          {token}
        </span>
      );
      remaining = remaining.slice(idx + token.length);
      key += 1;
    }
    if (remaining.length > 0) {
      out.push(...renderMarkdownSegment(remaining, `lm${key}t`));
    }
    return out;
  }
  return renderMarkdownSegment(body, "p");
}

// Phase 10 — 한 단락(entity 사이 plain text)에 한해 줄 단위로 list bullet
// 처리 후, 인라인 마크다운(**, *) 을 파싱한다. 줄바꿈은 원본 그대로
// 보존되므로(.body 가 white-space: pre-wrap) 별도 wrapping div 불필요.
function renderMarkdownSegment(text: string, keyPrefix: string): JSX.Element[] {
  if (!text) return [];
  const out: JSX.Element[] = [];
  // \n 도 결과 배열에 보존되도록 capture group split.
  const chunks = text.split(/(\n)/);
  let k = 0;
  for (const chunk of chunks) {
    if (chunk === "\n") {
      out.push(<span key={`${keyPrefix}-${k++}`}>{"\n"}</span>);
      continue;
    }
    if (chunk === "") continue;
    const bulletMatch = /^-\s+(.*)$/.exec(chunk);
    if (bulletMatch) {
      out.push(
        <span key={`${keyPrefix}-${k++}`} className={styles.listLine}>
          <span className={styles.bullet}>•</span>
          {parseInlineMarkdown(bulletMatch[1], `${keyPrefix}-${k}i`)}
        </span>
      );
      continue;
    }
    const inline = parseInlineMarkdown(chunk, `${keyPrefix}-${k}i`);
    out.push(<span key={`${keyPrefix}-${k++}`}>{inline}</span>);
  }
  return out;
}

// Phase 10 — `**bold**` 와 `*italic*` 만 지원하는 작은 인라인 파서.
// 욕심 부리지 않음 — backslash escape, 중첩, link, code 등은 처리하지
// 않는다 (사내 메신저 본문에 필요한 최소만). `**` 가 `*` 보다 먼저
// 매칭되도록 정규식 순서를 고정.
function parseInlineMarkdown(text: string, keyPrefix: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  const re = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}-${k++}`}>{t.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={`${keyPrefix}-${k++}`}>{t.slice(1, -1)}</em>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
