'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, Wallet } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { openBills } from '@/lib/ledger';
import { fmtDate, inr, todayISO } from '@/lib/format';
import { num, round2 } from '@/lib/calc';
import { useDocs, useHomeState, useLiveDocs } from '@/lib/store';
import PaymentSheet from '@/components/PaymentSheet';
import { Toast } from '@/components/ui';

export default function Payments() {
  const docs = useDocs();
  const live = useLiveDocs();
  const home = useHomeState();
  const [q, setQ] = useState('');
  const [bill, setBill] = useState<DocRecord | null>(null);
  const [toast, setToast] = useState('');

  const open = useMemo(() => {
    const ids = new Set(docs.map((d) => d.id));
    return openBills(live, home).filter((x) => ids.has(x.bill.id));
  }, [docs, live, home]);
  const today = todayISO();
  const rows = open
    .filter(({ bill: b }) => !q || JSON.stringify([b.number, b.data.customerName, b.data.customerPhone]).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.bill.data.dueDate || a.bill.docDate).localeCompare(b.bill.data.dueDate || b.bill.docDate));
  const outstanding = round2(open.reduce((a, x) => a + x.info.calc.balance, 0));
  const overdue = round2(open.filter((x) => x.bill.data.dueDate && x.bill.data.dueDate < today).reduce((a, x) => a + x.info.calc.balance, 0));
  const month = today.slice(0, 7);
  const receipts = docs.filter((d) => d.type === 'receipt').sort((a, b) => b.docDate.localeCompare(a.docDate) || b.createdAt.localeCompare(a.createdAt));
  const thisMonth = round2(receipts.filter((r) => r.docDate.startsWith(month)).reduce((a, r) => a + num(r.data.amount), 0));

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">Payments</h1><p className="text-xs text-slate-500">Outstanding bills and money received</p></div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 text-lg font-bold text-amber-700">{inr(outstanding)}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Overdue</p><p className="mt-1 text-lg font-bold text-red-600">{inr(overdue)}</p></div>
        <div className="card p-3"><p className="text-xs text-slate-500">Received this month</p><p className="mt-1 text-lg font-bold text-emerald-700">{inr(thisMonth)}</p></div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-10" placeholder="Search bill, customer, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Bills to collect ({rows.length})</h2>
        {rows.length === 0 ? <div className="card p-6 text-center text-sm text-slate-500">All bills are paid.</div> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map(({ bill: b, info }) => {
              const late = b.data.dueDate && b.data.dueDate < today;
              return (
                <li key={b.id} className="card p-3.5">
                  <Link href={`/docs/bill/view?id=${b.id}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{b.data.customerName}</p>
                      <p className="text-xs text-slate-500">{b.number} · {fmtDate(b.docDate)}</p>
                      {b.data.dueDate && <p className={`text-xs ${late ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{late ? 'Overdue since' : 'Due'} {fmtDate(b.data.dueDate)}</p>}
                    </div>
                    <div className="text-right"><p className="text-xs text-slate-500">Balance</p><p className="font-bold text-amber-700">{inr(info.calc.balance)}</p><p className="text-[11px] text-slate-400">of {inr(info.calc.total)}</p></div>
                  </Link>
                  <button onClick={() => setBill(b)} className="btn-primary mt-3 w-full"><Wallet size={17} />Record payment</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold text-slate-900">Recent receipts</h2>
        {receipts.length === 0 ? <p className="text-sm text-slate-500">No receipts yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {receipts.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link href={`/docs/receipt/view?id=${r.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{r.data.customerName}</span><span className="text-xs text-slate-500">{r.number} · {fmtDate(r.docDate)} · {r.data.paymentMode}</span></span>
                  <span className="font-semibold text-emerald-700">{inr(num(r.data.amount))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PaymentSheet bill={bill} open={!!bill} onClose={() => setBill(null)} onDone={(r) => { setToast(`Saved ${r.number}`); setTimeout(() => setToast(''), 3000); }} />
      <Toast msg={toast} />
    </div>
  );
}
