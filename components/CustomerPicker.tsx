'use client';
import { useMemo, useState } from 'react';
import { Search, UserCheck, X } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { leadToDocData, type Lead } from '@/lib/leads';
import { fmtPhone } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';

export interface Picked { data: Record<string, string>; leadId?: string; branchId?: string; label: string }

const DOC_KEYS = ['customerName', 'customerPhone', 'customerEmail', 'customerGst', 'billingAddress', 'fromCity', 'toCity', 'fromAddress', 'toAddress'];

/**
 * "Fill from a saved customer": searches the leads the user may see and the customers of past documents,
 * and hands back the details to copy into the form. Nothing is sent anywhere: it only reads what is already loaded.
 */
export default function CustomerPicker({ leads, docs, onPick }: { leads: Lead[]; docs: DocRecord[]; onPick: (p: Picked) => void }) {
  const [q, setQ] = useState('');
  const [openList, setOpenList] = useState(false);

  const fromDocs = useMemo(() => {
    const m = new Map<string, DocRecord>();
    for (const d of docs) {
      if (d.deletedAt || !(d.data.customerName || '').trim()) continue;
      const key = (phoneDigits(d.data.customerPhone || '') || d.data.customerName.trim().toLowerCase());
      const cur = m.get(key);
      if (!cur || d.docDate > cur.docDate) m.set(key, d);
    }
    return [...m.values()];
  }, [docs]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sd = phoneDigits(q);
    if (s.length < 2) return [];
    const ok = (name: string, phone: string, extra = '') => name.toLowerCase().includes(s) || extra.toLowerCase().includes(s) || (sd.length >= 3 && phoneDigits(phone).includes(sd));
    const a: (Picked & { sub: string; kind: 'Lead' | 'Past document' })[] = [];
    const seen = new Set<string>();
    for (const l of leads) {
      if (!ok(l.name, l.phone, l.email)) continue;
      seen.add(phoneDigits(l.phone) || l.name.toLowerCase());
      a.push({ kind: 'Lead', label: l.name || fmtPhone(l.phone), sub: [fmtPhone(l.phone), [l.fromCity, l.toCity].filter(Boolean).join(' → '), l.status].filter(Boolean).join(' · '), data: leadToDocData(l), leadId: l.id, branchId: l.branchId });
      if (a.length >= 8) break;
    }
    for (const d of fromDocs) {
      if (a.length >= 8) break;
      if (!ok(d.data.customerName, d.data.customerPhone || '')) continue;
      const k = phoneDigits(d.data.customerPhone || '') || d.data.customerName.toLowerCase();
      if (seen.has(k)) continue;
      const data: Record<string, string> = {};
      for (const key of DOC_KEYS) if (d.data[key]) data[key] = d.data[key];
      a.push({ kind: 'Past document', label: d.data.customerName, sub: [fmtPhone(d.data.customerPhone), d.number].filter(Boolean).join(' · '), data });
    }
    return a;
  }, [q, leads, fromDocs]);

  return (
    <div className="relative mb-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
      <label htmlFor="pick-customer" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-800"><UserCheck size={15} />Fill from a saved customer <span lang="hi" className="font-normal">· पुराना ग्राहक चुनें</span></label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input id="pick-customer" className="input pl-9" placeholder="Type name or mobile…" value={q} maxLength={60} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpenList(true); }} onFocus={() => setOpenList(true)} />
        {q && <button type="button" aria-label="Clear" onClick={() => { setQ(''); setOpenList(false); }} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-500"><X size={15} /></button>}
      </div>
      {openList && q.trim().length >= 2 && (
        <ul className="absolute left-3 right-3 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {hits.length === 0 ? <li className="px-3 py-3 text-sm text-slate-500">No saved customer found. Just fill the form below.</li> : hits.map((h, i) => (
            <li key={(h.leadId ?? 'd') + i}>
              <button type="button" className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-violet-50" onClick={() => { onPick(h); setQ(''); setOpenList(false); }}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold uppercase text-slate-900">{h.label}</span><span className="block truncate text-xs text-slate-500">{h.sub}</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${h.kind === 'Lead' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-slate-100 text-slate-600'}`}>{h.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[11px] text-slate-500">Only empty boxes are filled, so nothing you typed is replaced.</p>
    </div>
  );
}
