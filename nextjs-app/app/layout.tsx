import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KU-LMS+ 課題管理',
  description: '関西大学 WebClass の課題を一元管理',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'KMS+',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#004a8f',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-slate-50 min-h-dvh antialiased">
        {children}
      </body>
    </html>
  );
}
