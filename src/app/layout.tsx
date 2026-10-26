import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PFC Tracker",
  description: "毎日のPFCとカロリーを、確かな記録に。",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PFC Tracker",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
