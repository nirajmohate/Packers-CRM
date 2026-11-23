'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Check, Plus, Sun, X } from 'lucide-react';
import HeroArt from '@/components/HeroArt';
import { BY_SLUG, MODULES } from '@/lib/config';
import { billInfo, docCalc } from '@/lib/ledger';
import { num, round2 } from '@/lib/calc';
import { fmtDate, inr, inrShort, monthLabel } from '@/lib/format';
import { ApiFail, setDocStatus, useActiveBranch, useBranches, useDocs, useHomeState, useHydrated, useLiveDocs } from '@/lib/store';
import { Hi, ModuleIcon, Sheet, StatusBadge, Toast, useConfirm } from '@/components/ui';
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

  const s = useMemo(() => {
    const bills = docs.filter((d) => d.type === 'bill' && d.status !== 'Cancelled').map((b) => ({ b, i: billInfo(b, live, home(b.branchId)) }));
    const billed = round2(bills.reduce((a, x) => a + x.i.calc.total, 0));
    const pending = round2(bills.reduce((a, x) => a + x.i.calc.balance, 0));
    const received = round2(docs.filter((d) => d.type === 'receipt').reduce((a, d) => a + num(d.data.amount), 0) + bills.reduce((a, x) => a + x.i.calc.adv, 0));
    const customers = new Set(docs.map((d) => (d.data.customerPhone || d.data.customerName || '').trim().toLowerCase()).filter(Boolean)).size;
    return { bills, billed, pending, received, customers };
  }, [docs, live, home]);
  const count = (t: string) => docs.filter((d) => d.type === t).length;

  // "Hello, <branch>!" : the branch you are working in, or all branches for the admin
  const branchName = activeBranch === 'all' ? 'All branches' : branchList.find((b) => b.id === activeBranch)?.name ?? 'Branch';

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
    { label: 'Quotations', hi: 'कोटेशन', value: String(count('quotation')), bg: 'from-blue-600 to-blue-400', href: '/docs/quotation' },
    { label: 'Bills', hi: 'बिल', value: String(count('bill')), bg: 'from-green-600 to-emerald-400', href: '/docs/bill' },
    { label: 'Received', hi: 'मिला', value: inrShort(s.received), bg: 'from-teal-600 to-cyan-400', href: '/reports' },
    { label: 'Pending', hi: 'बाकी', value: inrShort(s.pending), bg: 'from-amber-500 to-orange-400', href: '/payments' },
    { label: 'Customers', hi: 'ग्राहक', value: String(s.customers), bg: 'from-violet-600 to-fuchsia-400', href: '/customers' },
  ];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-100 via-blue-50 to-sky-200 shadow-sm sm:flex sm:items-stretch">
        <div className="flex flex-col justify-center p-5 sm:w-[46%] sm:shrink-0 lg:p-7">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 grid h-11 w-11 shrink-0 place-items-center"><Sun className="text-amber-400" size={40} fill="#fcd34d" strokeWidth={1.5} /></span>
            <div className="min-w-0">
              <p className="break-words text-2xl font-extrabold leading-tight text-slate-900 lg:text-3xl">Hello, {branchName}!</p>
              <p lang="hi" className="text-sm text-slate-500">नमस्ते, {branchName}!</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600">Manage your shifting, create documents and track payments easily.</p>
          <div><button onClick={() => setCreate(true)} className="btn-primary mt-4"><Plus size={18} />Create new <span lang="hi" className="font-normal">· नया बनाएं</span></button></div>
        </div>
        <div className="flex items-end sm:flex-1">
          <HeroArt className="block h-auto w-full" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((x, i) => (
          <Link key={x.label} href={x.href} className={`rounded-2xl bg-gradient-to-br p-3.5 text-white shadow-sm active:opacity-90 ${x.bg} ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <p className="text-xs font-semibold text-white/90">{x.label} <span lang="hi" className="font-normal">· {x.hi}</span></p>
            <p className="mt-1 text-2xl font-bold">{x.value}</p>
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
        <h2 className="mb-2 font-semibold text-slate-900">Quick actions <Hi t="Quick actions" className="text-sm text-slate-500" /></h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {MODULES.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}/new`} className="card flex flex-col items-center gap-1.5 border-b-4 p-3 text-center active:bg-slate-50" style={{ borderBottomColor: m.color }}>
              <ModuleIcon cfg={m} size={40} />
              <span className="text-xs font-semibold leading-tight text-slate-800">{m.title}</span>
              <Hi t={m.title} className="text-[11px] leading-tight text-slate-500" />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {pendingQ.length > 0 && (
          <section className="card p-4">
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
          <h2 className="mb-2 font-semibold text-slate-900">Recent documents <Hi t="Recent documents" className="text-sm text-slate-500" /></h2>
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
