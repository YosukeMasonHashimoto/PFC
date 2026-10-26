import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaProvider } from "@/components/pwa";
export const metadata: Metadata = {
  title: "PFC Tracker",
  description: "毎日のPFCとカロリーを、確かな記録に。",
  other: { "apple-mobile-web-app-capable": "yes" },
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
  viewportFit: "cover",
  themeColor: "#0f766e",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
