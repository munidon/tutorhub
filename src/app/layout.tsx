import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TutorHub",
  description: "과외 일정 등록·확인·변경 요청 및 승인 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
