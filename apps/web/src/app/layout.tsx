import type { Metadata, Viewport } from "next";
import { AppDialogHost } from "@/components/ui/AppDialogHost";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "한미르톡",
  description: "한미르주식회사 사내 협업 플랫폼",
  manifest: "/manifest.webmanifest",
  applicationName: "한미르톡",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "한미르톡"
  },
  icons: {
    icon: "/assets/hanmir-logo.png",
    apple: "/assets/hanmir-logo.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1F4FA8"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        {children}
        {/* window.confirm/alert 대체 다이얼로그 — 전 라우트 공용 호스트 */}
        <AppDialogHost />
      </body>
    </html>
  );
}
