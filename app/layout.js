import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
});

export const metadata = {
  title: "🎮 AI 체험관",
  description: "Realize Academy · 3주차 AI 체험 프로젝트",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable}`}>
        {children}
      </body>
    </html>
  );
}
