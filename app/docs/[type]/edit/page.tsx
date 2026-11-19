'use client';
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BY_SLUG } from '@/lib/config';
import { useAllDocs, useHydrated } from '@/lib/store';
import DocForm from '@/components/DocForm';

function Inner() {
  const { type } = useParams<{ type: string }>();
  const id = useSearchParams().get('id');
  const docs = useAllDocs();
  const ready = useHydrated();
  const cfg = BY_SLUG[type];
  const rec = docs.find((d) => d.id === id);
  if (!ready) return null;
  if (!cfg || !rec) return <p className="py-10 text-center text-slate-500">Document not found on this device.</p>;
  return <DocForm key={rec.id} cfg={cfg} initial={rec} draftKey={`${type}_${rec.id}`} />;
}

export default function EditDoc() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
