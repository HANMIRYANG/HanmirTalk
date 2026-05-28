// multipart 업로드 파일명 정규화.
//
// 일부 HTTP 클라이언트(브라우저 / curl / 일부 모바일)는 RFC 5987 의
// `filename*=UTF-8''…` 폼 대신 `filename="…"` 만 보내며, 바이트 그대로
// UTF-8 로 인코딩한다. 그러나 busboy 의 oldest 동작은 그 헤더 값을 latin1
// 로 디코딩해서 우리에게 넘긴다 (multer 가 그대로 전달). 결과:
//
//   원본 디스크 파일명: "테스트 파일.pdf"   (UTF-8 6 bytes "테" + …)
//   busboy 가 본 string:  mojibake (각 UTF-8 바이트를 latin1 코드포인트로
//                         1:1 매핑한 결과 — C1 control range 가 본문에 등장)
//
// 이 mojibake 의 시그니처는 **C1 control range (U+0080 – U+009F)** 안의
// 코드포인트가 본문에 등장한다는 점이다 — 정상적인 사람 읽기 파일명에는
// 이 범위가 나오지 않는다 (한글/일문/중문/영문/일반 punctuation 모두).
// 따라서 이 범위가 발견되면 latin1 → utf8 재해석을 시도해서 복원한다.
//
// 보수성 원칙:
//   1. 처음부터 C1 range 가 없으면 (= ASCII / 정상 한글 등) 절대 손대지
//      않음. 이 함수는 idempotent.
//   2. 재해석 결과에 U+FFFD (replacement char) 가 끼면 원본 latin1 시퀀스
//      가 valid UTF-8 가 아니었다는 신호이므로 원본을 유지한다.
//   3. 빈 결과도 거부.
//
// 같은 헬퍼를 두 가지 용도로 사용한다:
//   - 업로드 시점 (routes/files.ts) → 입력 정규화
//   - DB 읽기 시점 (postgres.ts serialization) → 이미 깨진 채로 저장된
//     legacy row 의 사후 보정. idempotent 이므로 정상 파일명에는 무영향.
//
// 명시적 unicode escape 만 사용한다 — 소스 파일 자체에 C1 제어 바이트를
// 넣지 않아야 에디터/lint/diff 가 깨지지 않는다.

const C1_CONTROL_RANGE = new RegExp("[\\u0080-\\u009F]");
const UNICODE_REPLACEMENT = "�";

export function normalizeUploadOriginalName(original: string): string {
  if (!original) return original;
  // C1 제어문자가 한 글자도 없으면 정상 — 그대로 반환 (idempotent).
  if (!C1_CONTROL_RANGE.test(original)) return original;
  try {
    const restored = Buffer.from(original, "latin1").toString("utf8");
    if (!restored) return original;
    // Replacement char 가 끼면 latin1 해석이 잘못된 가설이라는 뜻 — 원본
    // 을 그대로 두는 게 사용자 입장에서 덜 혼란스럽다.
    if (restored.includes(UNICODE_REPLACEMENT)) return original;
    return restored;
  } catch {
    return original;
  }
}

// 의미적 alias — 호출부 가독성. 두 함수는 같은 구현을 공유한다.
export const restoreMojibakeFilename = normalizeUploadOriginalName;
