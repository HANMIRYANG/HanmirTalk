"use client";

// 방 정보 패널 등 서버 컴포넌트에서 쓰는 파일 다운로드 앵커.
// downloadUrl 은 클라이언트에서 계산해야 한다 — 서버 컴포넌트에서
// 렌더하면 prod SSR 의 내부 컨테이너 URL(http://server:4000)이 href 로
// 박혀 브라우저에서 접근 불가.
import type { ReactNode } from "react";
import { fileService } from "@/services/file.service";

interface RoomFileLinkProps {
  fileId: string;
  className?: string;
  children: ReactNode;
}

export function RoomFileLink({ fileId, className, children }: RoomFileLinkProps) {
  return (
    <a
      href={fileService.downloadUrl(fileId)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ textDecoration: "none", color: "inherit" }}
      title="다운로드"
    >
      {children}
    </a>
  );
}
