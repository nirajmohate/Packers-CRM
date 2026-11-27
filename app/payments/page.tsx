'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, Wallet } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { openBills } from '@/lib/ledger';
import { fmtDate, fmtPhone, inr, todayISO } from '@/lib/format';
import { num, round2 } from '@/lib/calc';
import { useDocs, useHomeState, useLiveDocs } from '@/lib/store';
import PaymentSheet from '@/components/PaymentSheet';
import { Toast } from '@/components/ui';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';

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
  const [shownB, sentinelB, moreB] = useInfinite(rows.length, q);
  const [shownR, sentinelR, moreR] = useInfinite(receipts.length, 'r');
  const thisMonth = round2(receipts.filter((r) => r.docDate.startsWith(month)).reduce((a, r) => a + num(r.data.amount), 0));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 p-4 text-white shadow-sm">
        <h1 className="text-xl font-bold">Payments</h1>
        <p className="text-xs text-white/85">Outstanding bills and money received</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card border-l-4 border-l-amber-500 p-3"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 truncate text-base font-bold sm:text-lg text-amber-700">{inr(outstanding)}</p></div>
        <div className="card border-l-4 border-l-red-500 p-3"><p className="text-xs text-slate-500">Overdue</p><p className="mt-1 truncate text-base font-bold sm:text-lg text-red-600">{inr(overdue)}</p></div>
        <div className="card col-span-2 border-l-4 border-l-emerald-500 p-3 sm:col-span-1"><p className="text-xs text-slate-500">Received this month</p><p className="mt-1 truncate text-base font-bold sm:text-lg text-emerald-700">{inr(thisMonth)}</p></div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input pl-10" placeholder="Search bill, customer, phone…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Bills to collect ({rows.length})</h2>
        {rows.length === 0 ? <div className="card p-6 text-center text-sm text-slate-500">All bills are paid.</div> : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="bg-amber-500 text-xs uppercase tracking-wide text-white">
                  <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Bill</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Due date</th>
                  <th className="px-3 py-2.5 text-right">Total</th><th className="px-3 py-2.5 text-right">Balance</th><th className="px-3 py-2.5 text-right">Action</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.slice(0, shownB).map(({ bill: b, info }, i) => {
                    const late = b.data.dueDate && b.data.dueDate < today;
                    return (
                      <tr key={b.id} className={late ? 'bg-red-50/70' : i % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                        <td className="px-3 py-2.5 font-semibold text-slate-500">{i + 1}.</td>
                        <td className="px-3 py-2.5"><Link href={`/docs/bill/view?id=${b.id}`} className="block whitespace-nowrap font-bold text-green-700 hover:underline">{b.number}</Link><span className="text-xs font-semibold text-orange-600">{fmtDate(b.docDate)}</span></td>
                        <td className="max-w-[200px] px-3 py-2.5"><span className="block truncate font-semibold uppercase text-fuchsia-700">{b.data.customerName}</span><span className="text-xs text-slate-500">Phone: {fmtPhone(b.data.customerPhone) || 'N/A'}</span></td>
                        <td className={`px-3 py-2.5 text-xs ${late ? 'font-bold text-red-600' : 'text-slate-600'}`}>{b.data.dueDate ? `${late ? 'Overdue · ' : ''}${fmtDate(b.data.dueDate)}` : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-700">{inr(info.calc.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-amber-700">{inr(info.calc.balance)}</td>
                        <td className="px-3 py-2.5 text-right"><button onClick={() => setBill(b)} className="btn min-h-[34px] whitespace-nowrap bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"><Wallet size={15} />Record payment</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <LoadMore shown={shownB} total={rows.length} sentinel={sentinelB} more={moreB} />
            <LoadCounter shown={shownB} total={rows.length} />
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-slate-900">Receipts ({receipts.length})</h2>
        {receipts.length === 0 ? <div className="card p-6 text-center text-sm text-slate-500">No receipts yet.</div> : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead><tr className="bg-pink-600 text-xs uppercase tracking-wide text-white">
                  <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Receipt</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Mode</th><th className="px-3 py-2.5 text-right">Amount</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {receipts.slice(0, shownR).map((r, i) => (
                    <tr key={r.id} className={i % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                      <td className="px-3 py-2.5 font-semibold text-slate-500">{i + 1}.</td>
                      <td className="px-3 py-2.5"><Link href={`/docs/receipt/view?id=${r.id}`} className="block whitespace-nowrap font-bold text-pink-700 hover:underline">{r.number}</Link><span className="text-xs font-semibold text-orange-600">{fmtDate(r.docDate)}</span></td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 font-semibold uppercase text-fuchsia-700">{r.data.customerName}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{r.data.paymentMode}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-emerald-700">{inr(num(r.data.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LoadMore shown={shownR} total={receipts.length} sentinel={sentinelR} more={moreR} />
          </>
        )}
      </section>

      <PaymentSheet bill={bill} open={!!bill} onClose={() => setBill(null)} onDone={(r) => { setToast(`Saved ${r.number}`); setTimeout(() => setToast(''), 3000); }} />
      <Toast msg={toast} />
    </div>
  );
}
