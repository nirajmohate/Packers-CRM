'use client';
import { useMemo, useState } from 'react';
import { MessageCircle, Phone, Search } from 'lucide-react';
import { billInfo } from '@/lib/ledger';
import { round2 } from '@/lib/calc';
import { inr } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { useDocs, useHomeState, useLiveDocs } from '@/lib/store';

export default function Customers() {
  const docs = useDocs();
  const live = useLiveDocs();
  const home = useHomeState();
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; count: number; billed: number; pending: number }>();
    for (const d of docs) {
      const name = (d.data.customerName || '').trim();
      if (!name) continue;
      const phone = (d.data.customerPhone || '').trim();
      const key = (phone || name).toLowerCase();
      const c = map.get(key) ?? { name, phone, count: 0, billed: 0, pending: 0 };
      c.count += 1;
      if (d.type === 'bill' && d.status !== 'Cancelled') { const i = billInfo(d, live, home(d.branchId)); c.billed = round2(c.billed + i.calc.total); c.pending = round2(c.pending + i.calc.balance); }
      map.set(key, c);
    }
    return [...map.values()].filter((c) => !q || (c.name + c.phone).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  }, [docs, live, home, q]);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">Customers</h1><p className="text-xs text-slate-500">Built automatically from your documents</p></div>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-10" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">No customers yet. They appear once you save a document.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((c) => {
            const d = phoneDigits(c.phone);
            return (
              <li key={c.name + c.phone} className="card flex items-center gap-3 p-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">{c.name[0]?.toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.phone || 'No phone'} · {c.count} docs{c.billed ? ` · billed ${inr(c.billed)}` : ''}</p>
                  {c.pending > 0 && <p className="text-xs font-semibold text-amber-700">Pending {inr(c.pending)}</p>}
                </div>
                {c.phone && (
                  <>
                    <a href={`tel:${c.phone}`} aria-label="Call" className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700"><Phone size={17} /></a>
                    <a href={`https://wa.me/${d.length === 10 ? '91' + d : d}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600"><MessageCircle size={17} /></a>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
