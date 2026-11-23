import type { Metadata, Viewport } from 'next';
import './globals.css';
import Shell from '@/components/Shell';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Cloud Packers CRM',
  description: 'Quotations, bills, LR and more for packers & movers',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon-192.png', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Cloud Packers', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1a64d0' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell><RegisterSW /></body>
    </html>
  );
}
