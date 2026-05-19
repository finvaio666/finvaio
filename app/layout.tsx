import type { Metadata, Viewport } from "next";
import { Sofia_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const sofiaSans = Sofia_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sofia",
});

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "Bill Morrisons — Consultant Dashboard",
  description: "Financial consulting dashboard for Bill Morrisons",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Bill Morrisons",
  },
};

export const viewport: Viewport = {
  themeColor: "#F3F0EE",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sofiaSans.variable} ${dmMono.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
