'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check, Plus, Truck, X } from 'lucide-react';
import { BY_SLUG, MODULES } from '@/lib/config';
import { billInfo, docCalc } from '@/lib/ledger';
import { num, round2 } from '@/lib/calc';
import { fmtDate, inr, inrShort, monthLabel } from '@/lib/format';
import { setDocStatus, useCompany, useDocs, useHomeState, useHydrated, useLiveDocs } from '@/lib/store';
import { ModuleIcon, Sheet, StatusBadge } from '@/components/ui';

export default function Dashboard() {
  const docs = useDocs();
  const live = useLiveDocs();
  const co = useCompany();
  const home = useHomeState();
  const ready = useHydrated();
  const [create, setCreate] = useState(false);

  const s = useMemo(() => {
    const bills = docs.filter((d) => d.type === 'bill' && d.status !== 'Cancelled').map((b) => ({ b, i: billInfo(b, live, home(b.branchId)) }));
    const billed = round2(bills.reduce((a, x) => a + x.i.calc.total, 0));
    const pending = round2(bills.reduce((a, x) => a + x.i.calc.balance, 0));
    const received = round2(docs.filter((d) => d.type === 'receipt').reduce((a, d) => a + num(d.data.amount), 0) + bills.reduce((a, x) => a + x.i.calc.adv, 0));
    const customers = new Set(docs.map((d) => (d.data.customerPhone || d.data.customerName || '').trim().toLowerCase()).filter(Boolean)).size;
    return { bills, billed, pending, received, customers };
  }, [docs, live, home]);
  const count = (t: string) => docs.filter((d) => d.type === t).length;

  const hour = ready ? new Date().getHours() : 9;
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const v = round2(s.bills.filter((x) => x.b.docDate.startsWith(key)).reduce((a, x) => a + x.i.calc.total, 0));
    return { label: monthLabel(d.getMonth()), v };
  });
  const maxV = Math.max(...months.map((m) => m.v), 1);

  const pendingQ = docs.filter((d) => d.type === 'quotation' && d.status === 'Pending').slice(0, 5);
  const recent = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);

  const stats = [
    { label: 'Quotations', value: String(count('quotation')), color: 'text-brand-700', href: '/docs/quotation' },
    { label: 'Bills', value: String(count('bill')), color: 'text-sky-700', href: '/docs/bill' },
    { label: 'Received', value: inrShort(s.received), color: 'text-emerald-700', href: '/reports' },
    { label: 'Pending', value: inrShort(s.pending), color: 'text-amber-700', href: '/payments' },
    { label: 'Customers', value: String(s.customers), color: 'text-violet-700', href: '/customers' },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-sky-400 p-5 text-white">
        <Truck className="absolute -right-4 -top-2 text-white/15" size={140} strokeWidth={1.2} />
        <p className="relative text-xl font-bold">{greet}{co.contactPerson ? `, ${co.contactPerson}` : ''}!</p>
        <p className="relative mt-1 max-w-xs text-sm text-white/90">Create quotations, bills and LRs, and share the PDF with your customer.</p>
        <button onClick={() => setCreate(true)} className="btn relative mt-4 bg-white text-brand-700"><Plus size={18} />Create new</button>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((x, i) => (
          <Link key={x.label} href={x.href} className={`card p-3.5 active:bg-slate-50 ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <p className="text-xs text-slate-500">{x.label}</p>
            <p className={`mt-1 text-2xl font-bold ${x.color}`}>{x.value}</p>
          </Link>
        ))}
      </section>

      {ready && docs.length === 0 && (
        <section className="card p-5 text-center">
          <p className="font-semibold text-slate-900">No documents yet</p>
          <p className="mt-1 text-sm text-slate-500">Create your first quotation or bill. It is saved on the server, so everyone with access sees it.</p>
          <div className="mt-4 flex justify-center"><Link href="/docs/quotation/new" className="btn-primary">New quotation</Link></div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {MODULES.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}/new`} className="card flex flex-col items-center gap-2 p-3 text-center active:bg-slate-50">
              <ModuleIcon cfg={m} size={40} />
              <span className="text-xs font-medium leading-tight text-slate-700">{m.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {pendingQ.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 font-semibold text-slate-900">Pending approvals</h2>
            <ul className="divide-y divide-slate-100">
              {pendingQ.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <Link href={`/docs/quotation/view?id=${d.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{d.number} · {d.data.customerName}</p>
                    <p className="text-xs text-slate-500">{inr(docCalc(d, BY_SLUG.quotation, live, home(d.branchId)).total)}</p>
                  </Link>
                  <button aria-label="Approve" onClick={() => setDocStatus(d.id, 'Approved')} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={18} /></button>
                  <button aria-label="Reject" onClick={() => setDocStatus(d.id, 'Rejected')} className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-500"><X size={18} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Billing, last 6 months</h2>
          <div className="flex h-36 items-end gap-2">
            {months.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-500">{m.v ? inrShort(m.v) : ''}</span>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-300" style={{ height: `${Math.max((m.v / maxV) * 100, m.v ? 6 : 2)}px` }} />
                <span className="text-xs text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {recent.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Recent documents</h2>
          <ul className="divide-y divide-slate-100">
            {recent.map((d) => {
              const cfg = BY_SLUG[d.type];
              if (!cfg) return null;
              return (
                <li key={d.id}>
                  <Link href={`/docs/${d.type}/view?id=${d.id}`} className="flex items-center gap-3 py-2.5">
                    <ModuleIcon cfg={cfg} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{d.data[cfg.party ?? 'customerName'] || '—'}</p>
                      <p className="truncate text-xs text-slate-500">{d.number} · {fmtDate(d.docDate)}</p>
                    </div>
                    <StatusBadge status={docCalc(d, cfg, live, home(d.branchId)).status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Sheet open={create} onClose={() => setCreate(false)} title="Create new">
        <div className="grid grid-cols-3 gap-3">
          {MODULES.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}/new`} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-3 text-center">
              <ModuleIcon cfg={m} /><span className="text-xs font-medium leading-tight">{m.title}</span>
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
