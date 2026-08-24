import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AR受発注システム',
  description: 'A-Frameを用いたWebARコンテンツ受発注システム',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}