"use client";

import { useRef, type ChangeEvent } from "react";
import { FolderIcon, UploadIcon } from "@/components/ui/icons";

// 업로드 실행은 FileLibrary 의 일괄 업로드 큐가 담당 — 여기서는 파일
// 선택만 받아 넘긴다.
interface PickButtonProps {
  onPick: (files: File[]) => void;
  disabled?: boolean;
}

function usePicker(onPick: (files: File[]) => void) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) onPick(files);
  };
  return { inputRef, onPicked, open: () => inputRef.current?.click() };
}

export function FileUploadButton({ onPick, disabled }: PickButtonProps) {
  const { inputRef, onPicked, open } = usePicker(onPick);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={onPicked}
      />
      <button
        className="btn btn--primary btn--sm"
        type="button"
        onClick={open}
        disabled={disabled}
      >
        <UploadIcon size={12} />
        업로드
      </button>
    </>
  );
}

export function FolderUploadButton({ onPick, disabled }: PickButtonProps) {
  const { inputRef, onPicked, open } = usePicker(onPick);
  return (
    <>
      <input
        // webkitdirectory 는 JSX 속성 타입에 없어 DOM 프로퍼티로 지정
        // (lib.dom 의 HTMLInputElement.webkitdirectory).
        ref={(el) => {
          inputRef.current = el;
          if (el) el.webkitdirectory = true;
        }}
        type="file"
        style={{ display: "none" }}
        onChange={onPicked}
      />
      <button
        className="btn btn--outline btn--sm"
        type="button"
        onClick={open}
        disabled={disabled}
      >
        <FolderIcon size={12} />
        폴더 업로드
      </button>
    </>
  );
}
