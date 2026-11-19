'use client';
import { useParams } from 'next/navigation';
import { BY_SLUG } from '@/lib/config';
import { useDocs, useHydrated } from '@/lib/store';
import DocForm from '@/components/DocForm';

export default function EditDoc() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const docs = useDocs();
  const ready = useHydrated();
  const cfg = BY_SLUG[type];
  const rec = docs.find((d) => d.id === id);
  if (!ready) return null;
  if (!cfg || !rec) return <p className="py-10 text-center text-slate-500">Document not found on this device.</p>;
  return <DocForm cfg={cfg} initial={rec} />;
}
