"use client";

import type { ReactNode, RefObject } from "react";
import type { MessageEntity } from "@hanmir/shared";
import styles from "../MessageComposer.module.css";

// Phase 5 H-2 보강 — 태그가 실제로 걸렸는지 입력창에서 바로 보이도록,
// entity 구간을 <mark> 로 감싼 백드롭용 노드를 만든다. 글자는 투명
// (textarea 의 실제 텍스트가 위에 겹침), 배경 pill 만 보인다.
const renderHighlightNodes = (value: string, entities: MessageEntity[]): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const sorted = [...entities].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  for (const e of sorted) {
    if (e.offset < cursor) continue; // 겹침 안전장치 — reconcile 상 발생 안 함
    if (e.offset > cursor) nodes.push(value.slice(cursor, e.offset));
    nodes.push(
      <mark key={`${e.type}:${e.id}:${e.offset}`} className={styles.highlightToken}>
        {value.slice(e.offset, e.offset + e.length)}
      </mark>
    );
    cursor = e.offset + e.length;
  }
  nodes.push(value.slice(cursor));
  // 후행 개행도 textarea 와 같은 높이로 렌더되도록 zero-width space.
  nodes.push("​");
  return nodes;
};

interface ComposerHighlighterProps {
  value: string;
  entities: MessageEntity[];
  highlighterRef: RefObject<HTMLDivElement>;
}

// 멘션 하이라이트 백드롭 — textarea 와 동일한 글꼴/패딩으로 뒤에 깔려
// entity 구간에만 파란 배경 pill 을 그린다. 스크롤 동기화는 호출부가
// highlighterRef 로 처리한다.
export function ComposerHighlighter({ value, entities, highlighterRef }: ComposerHighlighterProps) {
  return (
    <div ref={highlighterRef} className={styles.highlighter} aria-hidden="true">
      {renderHighlightNodes(value, entities)}
    </div>
  );
}
