import type { Metadata } from 'next';

// private one-time links: never indexed, and the link is not passed on to other sites
export const metadata: Metadata = {
  title: 'Survey form · Cloud Packers',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
