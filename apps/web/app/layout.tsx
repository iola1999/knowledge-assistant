import type { ReactNode } from "react";
import { Inter, Manrope } from "next/font/google";

import { AppSessionProvider } from "@/components/shared/session-provider";
import { textSelectionStyles } from "@/lib/ui";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${textSelectionStyles.chrome} ${inter.variable} ${manrope.variable}`}>
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
