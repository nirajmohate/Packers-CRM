'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { BY_SLUG } from '@/lib/config';
import { billInfo } from '@/lib/ledger';
import { num, round2 } from '@/lib/calc';
import { fmtDate, inr, todayISO } from '@/lib/format';
import { fyOf } from '@/lib/numbering';
import { docRows, exportSheets, type Sheet as XSheet } from '@/lib/export';
import { ensureSince, useBranches, useDocs, useHomeState, useLiveDocs } from '@/lib/store';
import { StatusBadge, Sheet } from '@/components/ui';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';

const PERIODS = ['This month', 'Last month', 'This financial year', 'Last financial year', 'All time', 'Custom'] as const;
type Period = (typeof PERIODS)[number];

function range(p: Period, from: string, to: string): [string, string] {
  const now = new Date();
  const iso = (d: Date) => todayISO(d);
  if (p === 'This month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
  if (p === 'Last month') return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (p === 'This financial year' || p === 'Last financial year') {
    const start = Number(fyOf(todayISO()).slice(0, 4)) - (p === 'Last financial year' ? 1 : 0);
    return [`${start}-04-01`, `${start + 1}-03-31`];
  }
  if (p === 'Custom') return [from || '0000-01-01', to || '9999-12-31'];
  return ['0000-01-01', '9999-12-31'];
}

export default function Reports() {
  const docs = useDocs();
  const live = useLiveDocs();
  const home = useHomeState();
  const branches = useBranches();
  const [period, setPeriod] = useState<Period>('This financial year');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState('All');
  const [menu, setMenu] = useState(false);
  const [lo, hi] = range(period, from, to);
  // reports can reach further back than the documents loaded at sign-in
  useEffect(() => { if (lo !== '0000-01-01') ensureSince(lo); else ensureSince('2000-01-01'); }, [lo]);

  const r = useMemo(() => {
    const inRange = (d: string) => d >= lo && d <= hi;
    const cust = (d: { data: Record<string, string> }) => !customer || (d.data.customerPhone || d.data.customerName) === customer;
    const customers = new Map<string, string>();
    docs.forEach((d) => { const k = d.data.customerPhone || d.data.customerName; if (k && d.data.customerName) customers.set(k, d.data.customerName); });

    const bills = docs.filter((d) => d.type === 'bill' && inRange(d.docDate) && cust(d)).map((b) => ({ b, i: billInfo(b, live, home(b.branchId)) }));
    const active = bills.filter((x) => x.i.status !== 'Cancelled');
    const billed = round2(active.reduce((a, x) => a + x.i.calc.total, 0));
    const taxable = round2(active.reduce((a, x) => a + x.i.calc.taxable, 0));
    const gst = round2(active.reduce((a, x) => a + x.i.calc.gst, 0));
    const pending = round2(active.reduce((a, x) => a + x.i.calc.balance, 0));
    const receipts = docs.filter((d) => d.type === 'receipt' && inRange(d.docDate) && cust(d));
    const received = round2(receipts.reduce((a, d) => a + num(d.data.amount), 0));
    const quotes = docs.filter((d) => d.type === 'quotation' && inRange(d.docDate) && cust(d));
    const approved = quotes.filter((d) => d.status === 'Approved').length;

    const byCust = new Map<string, { name: string; count: number; billed: number; paid: number; pending: number }>();
    active.forEach(({ b, i }) => {
      const k = b.data.customerPhone || b.data.customerName;
      const c = byCust.get(k) ?? { name: b.data.customerName, count: 0, billed: 0, paid: 0, pending: 0 };
      c.count++; c.billed = round2(c.billed + i.calc.total); c.paid = round2(c.paid + i.calc.paid); c.pending = round2(c.pending + i.calc.balance);
      byCust.set(k, c);
    });
    const shown = bills.filter((x) => status === 'All' || x.i.status === status).sort((a, b) => b.b.docDate.localeCompare(a.b.docDate));
    return { customers, shown, billed, taxable, gst, pending, received, quotes, approved, byCust: [...byCust.values()].sort((a, b) => b.pending - a.pending), receipts };
  }, [docs, live, home, lo, hi, customer, status]);

  const key = [lo, hi, customer, status].join('|');
  const [shownC, sentinelC, moreC] = useInfinite(r.byCust.length, key);
  const [shownB, sentinelB, moreB] = useInfinite(r.shown.length, key);
  const exportNow = async (f: 'xlsx' | 'csv') => {
    setMenu(false);
    const bills = r.shown.map((x) => x.b);
    const sheets: XSheet[] = [
      { name: 'Bills', rows: docRows(BY_SLUG.bill, bills, live, branches, home) },
      { name: 'Customers', rows: [['Customer', 'Bills', 'Billed', 'Received', 'Pending'], ...r.byCust.map((c) => [c.name, c.count, c.billed, c.paid, c.pending])] },
      { name: 'Receipts', rows: docRows(BY_SLUG.receipt, r.receipts, live, branches, home) },
    ];
    await exportSheets(sheets, `report-${todayISO()}`, f);
  };

  const cards = [
    { l: 'Billed', v: inr(r.billed), c: 'text-brand-700' }, { l: 'GST collected', v: inr(r.gst), c: 'text-violet-700' },
    { l: 'Received', v: inr(r.received), c: 'text-emerald-700' }, { l: 'Pending', v: inr(r.pending), c: 'text-amber-700' },
    { l: `Quotations (${r.approved} approved)`, v: String(r.quotes.length), c: 'text-sky-700' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">Reports</h1><p className="text-xs text-slate-500">{lo === '0000-01-01' ? 'All time' : `${fmtDate(lo)} to ${fmtDate(hi)}`}</p></div>
        <button className="btn-primary" onClick={() => setMenu(true)}><Download size={17} />Export</button>
      </div>

      <section className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1"><label className="label">Period</label>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>{PERIODS.map((p) => <option key={p}>{p}</option>)}</select></div>
        {period === 'Custom' && (<><div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div></>)}
        <div><label className="label">Customer</label>
          <select className="input" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All customers</option>
            {[...r.customers.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select></div>
        <div><label className="label">Bill status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{['All', 'Unpaid', 'Partial', 'Paid', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select></div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => <div key={c.l} className="card border-l-4 border-l-brand-500 p-3.5"><p className="text-xs text-slate-500">{c.l}</p><p className={`mt-1 text-xl font-bold ${c.c}`}>{c.v}</p></div>)}
      </section>
      <p className="px-1 text-xs text-slate-500">Taxable value of bills: {inr(r.taxable)}. Cancelled bills are left out of the totals.</p>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold text-slate-900">Customer-wise outstanding</h2>
        {r.byCust.length === 0 ? <p className="text-sm text-slate-500">No bills in this period.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {r.byCust.slice(0, shownC).map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{c.name}</span><span className="text-xs text-slate-500">{c.count} bills · billed {inr(c.billed)} · paid {inr(c.paid)}</span></span>
                <span className={`font-bold ${c.pending > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{inr(c.pending)}</span>
              </li>
            ))}
          </ul>
        )}
        {r.byCust.length > 0 && <LoadMore shown={shownC} total={r.byCust.length} sentinel={sentinelC} more={moreC} />}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold text-slate-900">Bills ({r.shown.length})</h2>
        {r.shown.length === 0 ? <p className="text-sm text-slate-500">Nothing to show.</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead><tr className="bg-green-600 text-xs uppercase tracking-wide text-white">
                  <th className="w-10 px-3 py-2">#</th><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {r.shown.slice(0, shownB).map(({ b, i }, n) => (
                    <tr key={b.id} className={n % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                      <td className="px-3 py-2 font-semibold text-slate-500">{n + 1}.</td>
                      <td className="px-3 py-2"><Link href={`/docs/bill/view?id=${b.id}`} className="block whitespace-nowrap font-bold text-green-700 hover:underline">{b.number}</Link><span className="text-xs font-semibold text-orange-600">{fmtDate(b.docDate)}</span></td>
                      <td className="max-w-[220px] truncate px-3 py-2 font-semibold uppercase text-fuchsia-700">{b.data.customerName}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold">{inr(i.calc.total)}</td>
                      <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LoadMore shown={shownB} total={r.shown.length} sentinel={sentinelB} more={moreB} />
            <LoadCounter shown={shownB} total={r.shown.length} />
          </>
        )}
      </section>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Export report">
        <div className="grid gap-3">
          <button className="btn-primary" onClick={() => exportNow('xlsx')}>Excel with all sheets (.xlsx)</button>
          <button className="btn-ghost" onClick={() => exportNow('csv')}>Bills only (CSV)</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Excel has three sheets: Bills (with CGST, SGST, IGST), Customers and Receipts.</p>
      </Sheet>
    </div>
  );
}
