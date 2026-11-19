import { MODULES } from '@/lib/config';

export const dynamicParams = false;
export function generateStaticParams() {
  return MODULES.map((m) => ({ type: m.slug }));
}

export default function TypeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
