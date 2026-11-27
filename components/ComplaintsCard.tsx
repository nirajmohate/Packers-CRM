'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, MessageSquareWarning } from 'lucide-react';
import { useSession } from '@/lib/store';
import { useComplaints } from '@/lib/complaintStore';
import { COMPLAINT_TONE, OPEN_STATUSES, isOverdue } from '@/lib/complaints';
import { todayISO } from '@/lib/format';

/** Dashboard: open / overdue complaints, and once a day a popup when some have had no action for 48 hours. */
export default function ComplaintsCard() {
  const me = useSession();
  const admin = me?.role === 'admin';
  const { list, loaded } = useComplaints();
  const open = useMemo(() => list.filter((c) => OPEN_STATUSES.has(c.status)), [list]);
  const overdue = useMemo(() => open.filter((c) => isOverdue(c)), [open]);
  const toForward = useMemo(() => (admin ? open.filter((c) => !c.branchId) : []), [open, admin]);
  const top = useMemo(() => [...open].sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || b.createdAt.localeCompare(a.createdAt)).slice(0, 4), [open]);

  const [popup, setPopup] = useState(false);
  useEffect(() => {
    if (!loaded || !overdue.length || !me) return;
    const key = `pm_complaint_popup_${me.id}`;
    try { if (localStorage.getItem(key) === todayISO()) return; localStorage.setItem(key, todayISO()); } catch { /* private mode: show anyway */ }
    setPopup(true);
  }, [loaded, overdue.length, me]);

  return (
    <>
      <section className="card min-w-0 p-4">
        <div className="mb-2 flex items-center gap-2">
          <MessageSquareWarning size={18} className="text-rose-600" />
          <h2 className="flex-1 font-semibold text-slate-900">Complaints</h2>
          <Link href="/complaints" className="text-xs font-semibold text-brand-700">Open all</Link>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Link href="/complaints?view=open" className="rounded-xl bg-rose-50 p-2"><p className="text-xl font-bold text-rose-700">{open.length}</p><p className="text-[11px] text-rose-800">Open</p></Link>
          <Link href="/complaints?view=overdue" className={`rounded-xl p-2 ${overdue.length ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-700'}`}><p className="text-xl font-bold">{overdue.length}</p><p className="text-[11px]">Over 48 h</p></Link>
          {admin ? <Link href="/complaints?view=unassigned" className={`rounded-xl p-2 ${toForward.length ? 'bg-amber-100 text-amber-900' : 'bg-slate-50 text-slate-700'}`}><p className="text-xl font-bold">{toForward.length}</p><p className="text-[11px]">To forward</p></Link>
            : <Link href="/complaints?view=Resolved" className="rounded-xl bg-emerald-50 p-2 text-emerald-800"><p className="text-xl font-bold">{list.filter((c) => c.status === 'Resolved').length}</p><p className="text-[11px]">Resolved</p></Link>}
        </div>
        {!loaded ? <p className="text-sm text-slate-400">Loading…</p> : !top.length ? <p className="text-sm text-slate-500">No open complaints.</p> : (
          <ul className="divide-y divide-slate-100">
            {top.map((c) => (
              <li key={c.id}>
                <Link href={`/complaints?id=${c.id}`} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.name || c.phone || c.ref}</p>
                    <p className="truncate text-xs text-slate-500">{c.subject || c.message}</p>
                  </div>
                  {isOverdue(c) ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white"><AlarmClock size={10} />48 h+</span>
                    : <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${COMPLAINT_TONE[c.status] ?? ''}`}>{c.status}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {popup && (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-slate-900/50 p-4" onClick={() => setPopup(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="cmp-pop" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><AlarmClock size={26} /></span>
            <h2 id="cmp-pop" className="mt-3 text-lg font-bold text-slate-900">{overdue.length} complaint{overdue.length === 1 ? '' : 's'} still pending</h2>
            <p className="mt-1 text-sm text-slate-600">No action for more than 48 hours. Please call the customer and update the status.</p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
              {overdue.slice(0, 6).map((c) => <li key={c.id} className="truncate rounded-lg bg-red-50 px-2 py-1.5 text-red-900"><b>{c.name || c.phone}</b> · {c.subject || c.message}</li>)}
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setPopup(false)}>Later</button>
              <Link href="/complaints?view=overdue" className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => setPopup(false)}>Open them</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
