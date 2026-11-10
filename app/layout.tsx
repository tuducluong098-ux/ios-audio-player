import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LiquidAudio — Nghe nhạc nền iOS',
  description:
    'Trình phát âm thanh nền phong cách Apple Liquid Glass cho TikTok & YouTube, hỗ trợ Dynamic Island và khóa màn hình iOS.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LiquidAudio',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#030306',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#030306] text-white antialiased selection:bg-white/25 selection:text-white">
        {children}
      </body>
    </html>
  );
}
