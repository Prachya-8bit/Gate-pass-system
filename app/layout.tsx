import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบ Gate Pass | โรงงาน',
  description: 'ระบบลงทะเบียนผู้รับเหมาและติดตามแรงงานรายวัน',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          background: '#f0f4f8',
          fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
