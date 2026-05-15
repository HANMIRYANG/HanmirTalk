# 12. 파일 업로드 정책

## 허용 파일

- 이미지: jpg, jpeg, png, webp
- 문서: pdf, doc, docx, hwp, hwpx
- 스프레드시트: xls, xlsx, csv
- 발표자료: ppt, pptx
- 압축: zip

## 제한

- MVP 기본 파일 크기 제한: 50MB
- 관리자 설정으로 변경 가능하게 설계
- 실행 파일 업로드 금지

## 보안

- 파일명 sanitize 처리
- 업로드 MIME type 검사
- 다운로드 권한 검사
- 파일 URL 직접 공개 금지 권장
- 가능하면 signed URL 사용

## 연결 구조

파일은 다음 대상과 연결될 수 있다.

- 메시지
- 프로젝트
- 업무
- 제품
- 결정사항
