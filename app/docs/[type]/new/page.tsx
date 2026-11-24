'use client';
import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BY_SLUG } from '@/lib/config';
import { useAllDocs, useHomeState, useHydrated, useSession } from '@/lib/store';
import { prefillFrom } from '@/lib/convert';
import { useLeads } from '@/lib/leadStore';
import { leadToDocData } from '@/lib/leads';
import { canSee } from '@/lib/roles';
import DocForm from '@/components/DocForm';

function Inner() {
  const { type } = useParams<{ type: string }>();
  const sp = useSearchParams();
  const from = sp.get('from');
  const leadParam = sp.get('lead');
  const leadId = leadParam && /^[a-f0-9]{24}$/i.test(leadParam) ? leadParam : '';
  const me = useSession();
  const docs = useAllDocs();
  const home = useHomeState();
  const ready = useHydrated();
  const { leads, loaded } = useLeads(!!leadId && canSee(me, 'customers'));
  const cfg = BY_SLUG[type];
  if (!cfg) return <p className="py-10 text-center text-slate-500">Unknown document type.</p>;
  if (!ready || (leadId && canSee(me, 'customers') && !loaded)) return null;
  const src = from ? docs.find((d) => d.id === from) : undefined;
  let prefill = src && BY_SLUG[src.type] ? prefillFrom(src, BY_SLUG[src.type], cfg, docs, home(src.branchId)) : undefined;
  // "Create quotation / bill" from a saved customer: copy the details that this form has boxes for
  const lead = leadId ? leads.find((l) => l.id === leadId) : undefined;
  if (lead && !prefill) {
    const keys = new Set(cfg.sections.flatMap((s) => s.fields.map((f) => f.key)));
    prefill = { data: Object.fromEntries(Object.entries(leadToDocData(lead)).filter(([k]) => keys.has(k))), items: [] };
  }
  const key = `${type}-${from ?? ''}-${lead?.id ?? ''}`;
  return <DocForm key={key} cfg={cfg} prefill={prefill} leadId={lead?.id} leadBranch={lead?.branchId} draftKey={`${type}_new${from ? '_' + from : lead ? '_lead_' + lead.id : ''}`} />;
}

export default function NewDoc() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
