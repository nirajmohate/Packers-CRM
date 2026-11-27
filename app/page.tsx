'use client';
import SecurityAlerts from '@/components/SecurityAlerts';
import ComplaintsCard from '@/components/ComplaintsCard';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Phone, Plus, Sun, X } from 'lucide-react';
import DateRangeBar, { useDateRange } from '@/components/DateRangeBar';
import HeroArt from '@/components/HeroArt';
import { BY_SLUG, MODULES as ALL_MODULES } from '@/lib/config';
import { canSee, canUseType } from '@/lib/roles';
import { billInfo, docCalc } from '@/lib/ledger';
import { num, round2 } from '@/lib/calc';
import { fmtDate, fmtPhone, inr, inrShort, monthLabel, todayISO } from '@/lib/format';
import { ApiFail, useSession, ensureSince, setDocStatus, useActiveBranch, useBranches, useDocs, useHomeState, useHydrated, useLiveDocs, useSince } from '@/lib/store';
import { ModuleIcon, Sheet, StatusBadge, Toast, useConfirm } from '@/components/ui';
import type { DocRecord } from '@/lib/types';

export default function Dashboard() {
  const docs = useDocs();
  const live = useLiveDocs();
  const [activeBranch] = useActiveBranch();
  const branchList = useBranches();
  const home = useHomeState();
  const ready = useHydrated();
  const [create, setCreate] = useState(false);
  const [ask, confirmDialog] = useConfirm();
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  /** Approve or reject a quotation, only after the user confirms in the popup. */
  const decide = async (d: DocRecord, to: 'Approved' | 'Rejected') => {
    if (busyId) return;
    const approve = to === 'Approved';
    const amount = inr(docCalc(d, BY_SLUG.quotation, live, home(d.branchId)).total);
    const ok = await ask({
      tone: approve ? 'green' : 'red',
      title: approve ? 'Approve this quotation?' : 'Reject this quotation?',
      message: (
        <>
          <p>Quotation <b className="text-slate-900">{d.number}</b> for <b className="text-slate-900">{d.data.customerName || 'this customer'}</b> ({amount}) will change from <b>Pending</b> to <b className={approve ? 'text-emerald-700' : 'text-red-600'}>{to}</b>.</p>
          <p className="mt-2 text-xs text-slate-500">You can change it again later from the quotation page. The change is saved in its history.</p>
        </>
      ),
      confirmLabel: approve ? 'Yes, approve' : 'Yes, reject',
    });
    if (!ok) return;
    setBusyId(d.id);
    try { await setDocStatus(d.id, to); say(`${d.number} marked ${to}`); }
    catch (e) { say(e instanceof ApiFail ? e.message : 'Could not change the status. Please try again.'); }
    finally { setBusyId(''); }
  };

  /* ----- date filter (like Search Console), remembered on this device ----- */
  const [range, setRange] = useDateRange('pm_dash_range', '28d');
  const since = useSince();
  const [loadingOld, setLoadingOld] = useState(false);
  useEffect(() => {
    // documents older than what is on this device are fetched only when the filter asks for them
    if (!since || range.from >= since) return;
    let stop = false;
    setLoadingOld(true);
    ensureSince(range.from).catch(() => {}).finally(() => { if (!stop) setLoadingOld(false); });
    return () => { stop = true; };
  }, [range.from, since]);
  const inRange = (iso: string) => !!iso && iso >= range.from && iso <= range.to;

  const s = useMemo(() => {
    const quotes = docs.filter((d) => d.type === 'quotation' && inRange(d.docDate)).map((q) => ({ q, total: docCalc(q, BY_SLUG.quotation, live, home(q.branchId)).total }));
    const bills = docs.filter((d) => d.type === 'bill' && d.status !== 'Cancelled' && inRange(d.docDate)).map((b) => ({ b, i: billInfo(b, live, home(b.branchId)) }));
    const receipts = docs.filter((d) => d.type === 'receipt' && inRange(d.docDate));
    const billed = round2(bills.reduce((a, x) => a + x.i.calc.total, 0));
    const pending = round2(bills.reduce((a, x) => a + x.i.calc.balance, 0));
    const received = round2(receipts.reduce((a, d) => a + num(d.data.amount), 0) + bills.reduce((a, x) => a + x.i.calc.adv, 0));
    const quoted = round2(quotes.reduce((a, x) => a + x.total, 0));
    const customers = new Set(docs.filter((d) => inRange(d.docDate)).map((d) => (d.data.customerPhone || d.data.customerName || '').trim().toLowerCase()).filter(Boolean)).size;
    return { quotes, bills, receipts, billed, pending, received, quoted, customers };
  }, [docs, live, home, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Hello, <branch>!" : the branch you are working in, or all branches for the admin
  // admin on all branches: "Hello, <admin's name>!"; otherwise the branch name
  const me = useSession();
  const branchName = activeBranch === 'all' ? (me?.name || 'Admin') : branchList.find((b) => b.id === activeBranch)?.name ?? 'Branch';
  const MODULES = ALL_MODULES.filter((m) => canUseType(me, m.slug));
  const money = canSee(me, 'payments'); // the team account sees no amounts of bills / payments

  /* ----- chart: quotation (red), bill (blue), paid (green) per day / week / month of the chosen period ----- */
  const chart = useMemo(() => {
    const dates = [...s.quotes.map((x) => x.q.docDate), ...s.bills.map((x) => x.b.docDate), ...s.receipts.map((d) => d.docDate)].sort();
    const today = todayISO();
    const from = range.key === 'all' ? dates[0] ?? today : range.from;
    const to = range.key === 'all' || range.to > today ? today : range.to;
    const DAY = 86_400_000;
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1);
    const unit: 'day' | 'week' | 'month' = days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
    const label = (iso: string) => `${Number(iso.slice(8))} ${monthLabel(Number(iso.slice(5, 7)) - 1)}`;
    const buckets: { key: string; label: string; q: number; b: number; p: number }[] = [];
    if (unit === 'month') {
      const d = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1);
      const end = to.slice(0, 7);
      for (let i = 0; i < 240; i++) {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets.push({ key: k, label: `${monthLabel(d.getMonth())}${d.getMonth() === 0 || i === 0 ? " '" + String(d.getFullYear()).slice(2) : ''}`, q: 0, b: 0, p: 0 });
        if (k >= end) break;
        d.setMonth(d.getMonth() + 1);
      }
    } else {
      const step = unit === 'day' ? 1 : 7;
      for (let t = Date.parse(from); t <= Date.parse(to); t += step * DAY) {
        const iso = new Date(t).toISOString().slice(0, 10);
        buckets.push({ key: iso, label: label(iso), q: 0, b: 0, p: 0 });
      }
    }
    const find = (iso: string) => {
      if (unit === 'month') return buckets.find((x) => x.key === iso.slice(0, 7));
      if (unit === 'day') return buckets.find((x) => x.key === iso);
      for (let i = buckets.length - 1; i >= 0; i--) if (buckets[i].key <= iso) return buckets[i];
      return undefined;
    };
    const put = (iso: string, k: 'q' | 'b' | 'p', v: number) => { const x = find(iso); if (x) x[k] = round2(x[k] + v); };
    s.quotes.forEach((x) => put(x.q.docDate, 'q', x.total));
    s.bills.forEach((x) => { put(x.b.docDate, 'b', x.i.calc.total); if (x.i.calc.adv) put(x.b.docDate, 'p', x.i.calc.adv); });
    s.receipts.forEach((d) => put(d.docDate, 'p', num(d.data.amount)));
    const max = Math.max(1, ...buckets.flatMap((x) => [x.q, x.b, x.p]));
    return { buckets, max, unit };
  }, [s, range.key, range.from, range.to]);

  /* ----- upcoming packing / moving in the next 30 days ----- */
  const upcoming = useMemo(() => {
    const today = todayISO();
    const limit = new Date(); limit.setDate(limit.getDate() + 30);
    const last = todayISO(limit);
    const rank: Record<string, number> = { packing: 3, quotation: 2, survey: 1 };
    const best = new Map<string, { d: DocRecord; date: string; what: string }>();
    for (const d of docs) {
      let date = '', what = '';
      if (d.type === 'packing') { date = d.data.packingDate || ''; what = 'Packing'; }
      else if (d.type === 'quotation' && d.status !== 'Rejected') { date = d.data.packingDate || d.data.moveDate || ''; what = d.data.packingDate ? 'Packing' : 'Moving'; }
      else if (d.type === 'survey') { date = d.data.moveDate || ''; what = 'Moving'; }
      if (!date || date < today || date > last) continue;
      // the same customer on the same day shows once (packing list first, then quotation, then survey)
      const key = `${(d.data.customerPhone || d.data.customerName || d.id).trim().toLowerCase()}|${date}`;
      const cur = best.get(key);
      if (!cur || rank[d.type] > rank[cur.d.type]) best.set(key, { d, date, what });
    }
    return [...best.values()].sort((a, b) => a.date.localeCompare(b.date) || a.d.number.localeCompare(b.d.number));
  }, [docs]);
  const [allUpcoming, setAllUpcoming] = useState(false);
  const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(todayISO())) / 86_400_000);

  const pendingQ = docs.filter((d) => d.type === 'quotation' && d.status === 'Pending').slice(0, 5);
  const recent = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);

  const allStats = [
    { label: 'Quotations', value: String(s.quotes.length), sub: inrShort(s.quoted), bg: 'from-blue-600 to-blue-400', href: '/docs/quotation' },
    { label: 'Bills', value: String(s.bills.length), sub: inrShort(s.billed), bg: 'from-green-600 to-emerald-400', href: '/docs/bill' },
    { label: 'Received', value: inrShort(s.received), sub: `${s.receipts.length} receipts`, bg: 'from-teal-600 to-cyan-400', href: '/reports' },
    { label: 'Pending', value: inrShort(s.pending), sub: 'on these bills', bg: 'from-amber-500 to-orange-400', href: '/payments' },
    { label: 'Customers', value: String(s.customers), sub: 'in this period', bg: 'from-violet-600 to-fuchsia-400', href: '/customers' },
  ];
  const teamStats = [
    allStats[0],
    { label: 'Surveys', value: String(docs.filter((d) => d.type === 'survey' && inRange(d.docDate)).length), sub: 'in this period', bg: 'from-violet-600 to-fuchsia-400', href: '/docs/survey' },
    { label: 'Packing lists', value: String(docs.filter((d) => d.type === 'packing' && inRange(d.docDate)).length), sub: 'in this period', bg: 'from-orange-500 to-amber-400', href: '/docs/packing' },
    { label: 'LR / Bilty', value: String(docs.filter((d) => d.type === 'lr' && inRange(d.docDate)).length), sub: 'in this period', bg: 'from-teal-600 to-cyan-400', href: '/docs/lr' },
    { label: 'Upcoming', value: String(upcoming.length), sub: 'next 30 days', bg: 'from-green-600 to-emerald-400', href: '/docs/packing' },
  ];
  const stats = money ? allStats : teamStats;

  return (
    <div className="space-y-4">
      {me?.role === 'admin' && <SecurityAlerts />}
      <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-100 via-blue-50 to-sky-200 shadow-sm sm:flex sm:items-stretch">
        <div className="flex flex-col justify-center p-4 sm:w-[46%] sm:shrink-0 lg:px-6 lg:py-4">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 grid h-11 w-11 shrink-0 place-items-center"><Sun className="text-amber-400" size={40} fill="#fcd34d" strokeWidth={1.5} /></span>
            <div className="min-w-0">
              <p className="break-words text-2xl font-extrabold leading-tight text-slate-900 lg:text-3xl">Hello, {branchName}!</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600">Manage your shifting, create documents and track payments easily.</p>
          <div><button onClick={() => setCreate(true)} className="btn-primary mt-4"><Plus size={18} />Create new</button></div>
        </div>
        <div className="flex items-end sm:flex-1">
          <HeroArt className="block h-auto max-h-[200px] w-full" />
        </div>
      </section>

      {/* period for the numbers and the chart */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DateRangeBar range={range} onChange={setRange} />
          {loadingOld && <span className="text-xs text-slate-500">Loading older documents…</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((x, i) => (
            <Link key={x.label} href={x.href} className={`rounded-2xl bg-gradient-to-br p-3.5 text-white shadow-sm active:opacity-90 ${x.bg} ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <p className="text-xs font-semibold text-white/90">{x.label}</p>
              <p className="mt-1 text-2xl font-bold">{x.value}</p>
              <p className="text-[11px] text-white/85">{x.sub}</p>
            </Link>
          ))}
        </div>
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
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {MODULES.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}/new`} className="card flex flex-col items-center gap-1 border-b-4 p-2 text-center active:bg-slate-50" style={{ borderBottomColor: m.color }}>
              <ModuleIcon cfg={m} size={34} />
              <span className="text-xs font-semibold leading-tight text-slate-800">{m.title}</span>
             
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Amounts <span className="text-sm font-normal text-slate-500">· {chart.unit === 'day' ? 'per day' : chart.unit === 'week' ? 'per week' : 'per month'}</span></h2>
            <div className="flex gap-3 text-xs font-medium text-slate-600">
              <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-red-500" />Quotation</span>
              <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-blue-500" />Bill</span>
              <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-sm bg-green-500" />Paid</span>
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-red-50 p-1.5"><p className="text-red-700">Quotation</p><p className="text-sm font-bold text-red-800">{inrShort(s.quoted)}</p></div>
            <div className="rounded-lg bg-blue-50 p-1.5"><p className="text-blue-700">Bill</p><p className="text-sm font-bold text-blue-800">{inrShort(s.billed)}</p></div>
            <div className="rounded-lg bg-green-50 p-1.5"><p className="text-green-700">Paid</p><p className="text-sm font-bold text-green-800">{inrShort(s.received)}</p></div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex h-44 items-end gap-1.5" style={{ minWidth: `${Math.max(chart.buckets.length * 30, 100)}px` }}>
              {chart.buckets.map((x, i) => {
                const step = Math.ceil(chart.buckets.length / 8);
                return (
                  <div key={x.key} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${x.label}\nQuotation ${inr(x.q)}\nBill ${inr(x.b)}\nPaid ${inr(x.p)}`}>
                    <div className="flex flex-1 items-end justify-center gap-[2px]">
                      {([['q', 'bg-red-500'], ['b', 'bg-blue-500'], ['p', 'bg-green-500']] as const).map(([k, c]) => (
                        <div key={k} className={`w-1/3 max-w-[16px] rounded-t ${c}`} style={{ height: `${x[k] ? Math.max((x[k] / chart.max) * 100, 3) : 0}%` }} />
                      ))}
                    </div>
                    <span className="mt-1 block h-4 whitespace-nowrap text-center text-[10px] text-slate-500">{i % step === 0 ? x.label : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {chart.buckets.every((x) => !x.q && !x.b && !x.p) && <p className="mt-2 text-center text-xs text-slate-400">No quotations, bills or payments in this period.</p>}
        </section>

        <section className="card min-w-0 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><CalendarClock size={18} className="text-orange-500" />Upcoming packing</h2>
          <p className="mb-2 text-xs text-slate-500">Next 30 days, from the packing date (or moving date) on quotations, packing lists and surveys.</p>
          {upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Nothing planned. Put a packing date on a quotation or packing list and it shows here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(allUpcoming ? upcoming : upcoming.slice(0, 6)).map(({ d, date, what }) => {
                const cfg = BY_SLUG[d.type];
                const n = daysTo(date);
                const when = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
                const tone = n === 0 ? 'bg-red-100 text-red-700 ring-red-200' : n <= 3 ? 'bg-blue-100 text-blue-700 ring-blue-200' : 'bg-green-100 text-green-700 ring-green-200';
                return (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <div className={`grid w-14 shrink-0 place-items-center rounded-xl py-1 text-center ring-1 ${tone}`}>
                      <span className="text-lg font-bold leading-none">{Number(date.slice(8))}</span>
                      <span className="text-[10px] font-semibold uppercase">{monthLabel(Number(date.slice(5, 7)) - 1)}</span>
                    </div>
                    <Link href={`/docs/${d.type}/view?id=${d.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{d.data.customerName || '—'}</p>
                      <p className="truncate text-xs text-slate-500"><b className={n === 0 ? 'text-red-600' : 'text-slate-700'}>{when}</b> · {what} · {cfg?.title} {d.number}</p>
                      {(d.data.fromCity || d.data.toCity) && <p className="truncate text-xs"><b className="text-emerald-700">{d.data.fromCity || '—'}</b> → <b className="text-red-600">{d.data.toCity || '—'}</b></p>}
                    </Link>
                    {d.data.customerPhone && <a href={`tel:+91${d.data.customerPhone.replace(/\D/g, '').slice(-10)}`} aria-label={`Call ${fmtPhone(d.data.customerPhone)}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200"><Phone size={16} /></a>}
                  </li>
                );
              })}
            </ul>
          )}
          {upcoming.length > 6 && <button className="mt-2 text-sm font-semibold text-brand-700" onClick={() => setAllUpcoming((v) => !v)}>{allUpcoming ? 'Show less' : `Show all ${upcoming.length}`}</button>}
        </section>
      </div>

      {(pendingQ.length > 0 || canSee(me, 'complaints')) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {pendingQ.length > 0 && <section className="card p-4">
            <h2 className="font-semibold text-slate-900">Quotations waiting for approval</h2>
            <p className="mb-2 text-xs text-slate-500">Tap ✓ to approve or ✕ to reject. You will be asked to confirm first.</p>
            <ul className="divide-y divide-slate-100">
              {pendingQ.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <Link href={`/docs/quotation/view?id=${d.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{d.number} · {d.data.customerName}</p>
                    <p className="text-xs text-slate-500">{inr(docCalc(d, BY_SLUG.quotation, live, home(d.branchId)).total)}</p>
                  </Link>
                  <button aria-label="Approve" title="Approve" disabled={!!busyId} onClick={() => decide(d, 'Approved')} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 disabled:opacity-50"><Check size={18} /></button>
                  <button aria-label="Reject" title="Reject" disabled={!!busyId} onClick={() => decide(d, 'Rejected')} className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-500 ring-1 ring-red-200 disabled:opacity-50"><X size={18} /></button>
                </li>
              ))}
            </ul>
          </section>}
          {canSee(me, 'complaints') && <ComplaintsCard />}
        </div>
      )}

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
      {confirmDialog}
      <Toast msg={toast} />
    </div>
  );
}
