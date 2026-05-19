# 한미르톡 — apps/web

한미르톡 프론트엔드 (Next.js 14 App Router · TypeScript · React 18).

## 실행 방법

저장소 루트에서:

```bash
npm install
npm run dev          # web + server 동시 (concurrently) — 가장 일반적인 워크플로
npm run dev:web      # 프론트만 (Next.js, http://localhost:3000)
npm run build        # 프로덕션 빌드
npm run start        # 빌드 결과 실행
npm run typecheck    # 모든 워크스페이스 타입 체크
```

또는 이 디렉터리에서 (web만):

```bash
cd apps/web
npm run dev
```

## 폴더 구조

```
apps/web/src/
  app/                     # Next.js App Router
    layout.tsx             # 루트 레이아웃 (PWA manifest, viewport)
    page.tsx               # /chat 으로 리다이렉트
    login/                 # /login
    (app)/                 # 사이드바·모바일 네비가 있는 라우트 그룹
      layout.tsx           # AppShell 마운트
      chat/                # 채팅 리스트 + 오늘 대시보드
        [roomId]/          # 채팅방
      projects/            # 프로젝트 리스트 / 상세 / 업무 / 간트
      products/            # 제품 리스트 / 상세
      files/               # 파일함
      notices/             # 공지
      admin/               # 관리자 대시보드
  components/
    shell/                 # Sidebar, Topbar, MobileNav, AppShell
    chat/                  # ChatList, MessageItem, MessageComposer, RoomInfoPane
    project/               # ProjectHeader, GanttTimeline
    ui/                    # Avatar, Tag, ProgressBar, IconButton, icons
  data/                    # mock-* 데이터
  services/                # *.service.ts (mock 반환, 추후 실제 API 연결)
  styles/globals.css       # 디자인 토큰 + 공통 클래스
  lib/                     # classNames 등
public/
  manifest.webmanifest     # PWA manifest
  assets/hanmir-logo.png   # 한미르 로고 (sidebar/PWA 아이콘)
```

## 디자인 기준

- `design-reference/html/*.html` 의 인라인 스타일을 기준으로
  `globals.css` 의 디자인 토큰(`--brand-blue`, `--text-1` 등)과 공통 클래스
  (`.btn`, `.tag`, `.avatar`, `.card`, `.progress`)를 복원했습니다.
- 화면별 고유 스타일은 CSS Modules 로 분리해 HTML 의 `<style>` 블록과 1:1 매칭합니다.
- `assets/shared.css` / `assets/chrome.js` 가 누락되어 있어 사이드바/탑바 컴포넌트는
  HTML 의 `data-nav` / `data-title` 속성과 동등한 `AppShell + Topbar` 로 직접 구현했습니다.

## Mock → 실제 백엔드 연결

`services/*.service.ts` 가 진입점입니다. 현재는 `data/mock-*.ts` 를 Promise 로 감싸
반환하므로, 추후 실제 API 응답으로 교체 시 시그니처만 유지하면 컴포넌트 변경이 거의 없습니다.

타입은 `packages/shared/src/types.ts` 에 모여 있어 백엔드(NestJS)와 공유 가능합니다.
