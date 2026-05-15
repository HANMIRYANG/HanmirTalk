import type { Metadata, Viewport } from "next";
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
      <body>{children}</body>
    </html>
  );
}
