'use client';
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BY_SLUG } from '@/lib/config';
import { useAllDocs, useHomeState, useHydrated } from '@/lib/store';
import { prefillFrom } from '@/lib/convert';
import DocForm from '@/components/DocForm';

function Inner() {
  const { type } = useParams<{ type: string }>();
  const from = useSearchParams().get('from');
  const docs = useAllDocs();
  const home = useHomeState();
  const ready = useHydrated();
  const cfg = BY_SLUG[type];
  if (!cfg) return <p className="py-10 text-center text-slate-500">Unknown document type.</p>;
  if (!ready) return null;
  const src = from ? docs.find((d) => d.id === from) : undefined;
  const prefill = src && BY_SLUG[src.type] ? prefillFrom(src, BY_SLUG[src.type], cfg, docs, home(src.branchId)) : undefined;
  return <DocForm key={`${type}-${from ?? ''}`} cfg={cfg} prefill={prefill} draftKey={`${type}_new${from ? '_' + from : ''}`} />;
}

export default function NewDoc() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
