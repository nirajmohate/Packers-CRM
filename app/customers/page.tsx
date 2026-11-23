'use client';
import { useMemo, useState } from 'react';
import { MessageCircle, Phone, Search } from 'lucide-react';
import { billInfo } from '@/lib/ledger';
import { round2 } from '@/lib/calc';
import { inr } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { useDocs, useHomeState, useLiveDocs } from '@/lib/store';
import { Hi } from '@/components/ui';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';

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
  const [shown, sentinel, more] = useInfinite(list.length, q);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 p-4 text-white shadow-sm">
        <h1 className="text-xl font-bold">Customers <Hi t="Customers" className="text-base text-white/85" /></h1>
        <p className="text-xs text-white/85">Built automatically from your documents · Total {list.length}</p>
      </div>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input pl-10" placeholder="Search name or phone…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">No customers yet. They appear once you save a document.</div> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="bg-violet-600 text-xs uppercase tracking-wide text-white">
                <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Customer <Hi t="Customer" className="normal-case text-white/80" /></th>
                <th className="px-3 py-2.5">Documents</th><th className="px-3 py-2.5 text-right">Billed</th><th className="px-3 py-2.5 text-right">Pending</th><th className="px-3 py-2.5 text-right">Contact</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-200">
                {list.slice(0, shown).map((c, i) => {
                  const d = phoneDigits(c.phone);
                  return (
                    <tr key={c.name + c.phone} className={i % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                      <td className="px-3 py-2.5 font-semibold text-slate-500">{i + 1}.</td>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">{c.name[0]?.toUpperCase()}</span>
                        <span className="min-w-0"><span className="block truncate font-semibold uppercase text-fuchsia-700">{c.name}</span><span className="block text-xs text-slate-500">Phone: {c.phone || 'N/A'}</span></span>
                      </span></td>
                      <td className="px-3 py-2.5 text-slate-700">{c.count}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{c.billed ? inr(c.billed) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${c.pending > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{c.pending > 0 ? inr(c.pending) : '—'}</td>
                      <td className="px-3 py-2.5"><span className="flex justify-end gap-1.5">
                        {c.phone ? (<>
                          <a href={`tel:${c.phone}`} aria-label="Call" className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sky-700"><Phone size={16} /></a>
                          <a href={`https://wa.me/${d.length === 10 ? '91' + d : d}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700"><MessageCircle size={16} /></a>
                        </>) : <span className="text-xs text-slate-400">No phone</span>}
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <LoadMore shown={shown} total={list.length} sentinel={sentinel} more={more} />
          <LoadCounter shown={shown} total={list.length} />
        </>
      )}
    </div>
  );
}
