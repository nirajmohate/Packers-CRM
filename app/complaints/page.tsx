'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlarmClock, Download, Loader2, Mail, MapPin, MessageCircle, Phone, Search, Send, X } from 'lucide-react';
import { useBranches, useSession } from '@/lib/store';
import { loadComplaints, updateComplaint, useComplaints } from '@/lib/complaintStore';
import { COMPLAINT_STATUSES, COMPLAINT_TONE, OPEN_STATUSES, isOverdue, type Complaint } from '@/lib/complaints';
import { fmtDate, fmtPhone, todayISO } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { exportSheets } from '@/lib/export';
import { Sheet, Toast } from '@/components/ui';
import DateRangeBar, { useDateRange } from '@/components/DateRangeBar';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';

type View = 'open' | 'overdue' | 'unassigned' | 'all' | (typeof COMPLAINT_STATUSES)[number];
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const age = (iso: string) => { const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000); return h < 1 ? 'just now' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`; };

export default function ComplaintsPage() {
  return <Suspense fallback={null}><Complaints /></Suspense>;
}

function Complaints() {
  const me = useSession();
  const admin = me?.role === 'admin';
  const branches = useBranches();
  const { list, loaded, loading, error } = useComplaints(me?.role !== 'team');
  const sp = useSearchParams();
  const [view, setView] = useState<View>((sp.get('view') as View) || 'open');
  const [range, setRange] = useDateRange('pm_complaints_range', 'all');
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [openId, setOpenId] = useState<string | null>(sp.get('id'));
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  const brName = (id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? '—' : 'Not forwarded');

  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    const d = phoneDigits(q);
    return list.filter((c) => c.createdAt.slice(0, 10) >= range.from && c.createdAt.slice(0, 10) <= range.to
      && (!branch || c.branchId === branch)
      && (!s || `${c.ref} ${c.name} ${c.email} ${c.refNumber} ${c.location} ${c.subject} ${c.message}`.toLowerCase().includes(s) || (d.length >= 4 && phoneDigits(c.phone).includes(d))));
  }, [list, range, branch, q]);
  const counts = useMemo(() => {
    const k: Record<string, number> = { open: 0, overdue: 0, unassigned: 0, all: base.length };
    for (const c of base) {
      k[c.status] = (k[c.status] ?? 0) + 1;
      if (OPEN_STATUSES.has(c.status)) k.open++;
      if (isOverdue(c)) k.overdue++;
      if (!c.branchId) k.unassigned++;
    }
    return k;
  }, [base]);
  const rows = useMemo(() => base.filter((c) => view === 'all' ? true : view === 'open' ? OPEN_STATUSES.has(c.status) : view === 'overdue' ? isOverdue(c) : view === 'unassigned' ? !c.branchId : c.status === view), [base, view]);
  const [shown, sentinel, more] = useInfinite(rows.length, JSON.stringify([view, q, branch, range.from, range.to]));
  const current = openId ? list.find((c) => c.id === openId) ?? null : null;

  const doExport = () => exportSheets([{
    name: 'Complaints',
    rows: [['Ref', 'Date', 'Name', 'Mobile', 'Email', 'Number given', 'Location', 'Subject', 'Complaint', 'Branch', 'Status', 'Overdue', 'Matched by', 'Last action'],
      ...rows.map((c) => [c.ref, fmtDate(c.createdAt.slice(0, 10)), c.name, fmtPhone(c.phone), c.email, c.refNumber, c.location, c.subject, c.message, brName(c.branchId), c.status, isOverdue(c) ? 'Yes' : '', c.matchedBy, when(c.lastActionAt)])],
  }], `complaints-${todayISO()}`, 'xlsx');

  const chips: [View, string, string?][] = [
    ['open', 'Open'], ['overdue', 'Over 48 h', 'red'], ...(admin ? [['unassigned', 'To forward', 'amber'] as [View, string, string]] : []),
    ...COMPLAINT_STATUSES.map((s) => [s, s] as [View, string]), ['all', 'All'],
  ];

  if (me?.role === 'team') return <p className="py-10 text-center text-slate-500">Complaints are handled by the branch owner and the admin.</p>;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 p-4 text-white shadow-sm">
        <h1 className="text-xl font-bold">Complaints</h1>
        <p className="text-xs text-white/90">{admin ? 'From the website complaint form. Matched ones go to their branch; the rest wait here for you to forward.' : 'Complaints for your branch from the website. Update the status after you call the customer.'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-10" placeholder="Search name, mobile, number, place…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-500" onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
        </div>
        {admin && <select aria-label="Branch" className="input w-auto min-w-[150px]" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        <button className="btn-ghost" onClick={doExport} disabled={!rows.length}><Download size={17} />Excel</button>
      </div>
      <DateRangeBar range={range} onChange={setRange} />
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        {chips.map(([k, label, tone]) => (
          <button key={k} onClick={() => setView(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${view === k ? 'bg-rose-600 text-white ring-rose-600' : tone === 'red' ? 'bg-red-50 text-red-700 ring-red-300' : tone === 'amber' ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-white text-slate-700 ring-slate-300'}`}>
            {label} {counts[k] ?? 0}
          </button>
        ))}
      </div>

      {error ? <div className="card p-6 text-center text-sm text-red-600">{error}</div>
        : !loaded || (loading && !list.length) ? <div className="card flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Loading complaints…</div>
          : !rows.length ? <div className="card p-8 text-center text-sm text-slate-500">{list.length ? 'No complaints here.' : 'No complaints yet. They appear here when customers send the website complaint form.'}</div>
            : (
              <>
                <ul className="space-y-2">
                  {rows.slice(0, shown).map((c) => {
                    const late = isOverdue(c);
                    return (
                      <li key={c.id}>
                        <button onClick={() => setOpenId(c.id)} className={`card flex w-full items-start gap-3 p-3 text-left hover:ring-2 hover:ring-rose-200 ${late ? 'border-red-300 bg-red-50/40' : ''}`}>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-semibold text-slate-900">{c.name || 'No name'}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${COMPLAINT_TONE[c.status] ?? ''}`}>{c.status}</span>
                              {late && <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white"><AlarmClock size={11} />{age(c.lastActionAt)} no action</span>}
                              {!c.branchId && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">To forward</span>}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-sm text-slate-700">{c.subject ? <b>{c.subject}: </b> : null}{c.message}</p>
                            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                              <span>{c.ref} · {when(c.createdAt)}</span>
                              {c.phone && <span>{fmtPhone(c.phone)}</span>}
                              {c.refNumber && <span>No. {c.refNumber}</span>}
                              {c.location && <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{c.location.slice(0, 40)}</span>}
                              {admin && <span className="font-semibold text-slate-700">{brName(c.branchId)}</span>}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <LoadMore shown={shown} total={rows.length} sentinel={sentinel} more={more} />
                <LoadCounter shown={shown} total={rows.length} />
              </>
            )}

      <Sheet open={!!current} onClose={() => setOpenId(null)} title={current ? `Complaint ${current.ref}` : ''}>
        {current && <Detail c={current} admin={admin} brName={brName} onDone={(m) => { say(m); }} />}
      </Sheet>
      <Toast msg={msg} />
    </div>
  );
}

function Detail({ c, admin, brName, onDone }: { c: Complaint; admin: boolean; brName: (id: string | null) => string; onDone: (m: string) => void }) {
  const branches = useBranches();
  const [status, setStatus] = useState(c.status);
  const [note, setNote] = useState('');
  const [to, setTo] = useState(c.branchId ?? c.suggestedBranchId ?? '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setStatus(c.status); setNote(''); setTo(c.branchId ?? c.suggestedBranchId ?? ''); setErr(''); }, [c.id, c.status, c.branchId, c.suggestedBranchId]);
  const d = phoneDigits(c.phone);
  const wa = d.length === 10 ? '91' + d : d;

  const save = async (body: { status?: string; note?: string; branchId?: string }, label: string) => {
    setBusy(label); setErr('');
    try { await updateComplaint(c.id, body); setNote(''); onDone(label); void loadComplaints(true); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${COMPLAINT_TONE[c.status] ?? ''}`}>{c.status}</span>
        {isOverdue(c) && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">No action for {age(c.lastActionAt)}</span>}
        <span className="text-xs text-slate-500">Received {when(c.createdAt)}</span>
      </div>
      <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
        <p><span className="text-xs text-slate-500">Name</span><br /><b>{c.name || '—'}</b></p>
        <p><span className="text-xs text-slate-500">Mobile</span><br /><b>{fmtPhone(c.phone) || c.phone || '—'}</b></p>
        <p className="break-all"><span className="text-xs text-slate-500">Email</span><br /><b>{c.email || '—'}</b></p>
        <p><span className="text-xs text-slate-500">Invoice / consignment no.</span><br /><b>{c.refNumber || '—'}</b></p>
        <p className="sm:col-span-2"><span className="text-xs text-slate-500">Location</span><br /><b>{c.location || '—'}</b>
          {c.location && <a className="ml-2 text-xs font-semibold text-brand-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/${encodeURIComponent(c.location)}`}>Open in Maps</a>}</p>
        {Object.entries(c.extra).map(([k, v]) => <p key={k} className="break-words"><span className="text-xs text-slate-500">{k.replace(/_/g, ' ')}</span><br />{v}</p>)}
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        {c.subject && <p className="font-semibold text-slate-900">{c.subject}</p>}
        <p className="whitespace-pre-wrap text-slate-800">{c.message || '—'}</p>
      </div>
      <p className="text-xs text-slate-500">Branch: <b className="text-slate-800">{brName(c.branchId)}</b>{c.matchedBy && <> · {c.branchId ? 'matched by' : ''} {c.matchedBy}</>}
        {c.matchedDocId && c.matchedDocType && <> · <Link className="text-brand-700 underline" href={`/docs/${c.matchedDocType}/view?id=${c.matchedDocId}`}>open matched document</Link></>}</p>

      <div className="grid grid-cols-3 gap-2">
        {c.phone ? <a href={`tel:${c.phone}`} className="btn bg-sky-600 text-white"><Phone size={16} />Call</a> : <span />}
        {c.phone ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn bg-emerald-600 text-white"><MessageCircle size={16} />WhatsApp</a> : <span />}
        {c.email ? <a href={`mailto:${c.email}?subject=${encodeURIComponent(`Your complaint ${c.ref} - Cloud Packers`)}`} className="btn bg-indigo-600 text-white"><Mail size={16} />Email</a> : <span />}
      </div>

      {admin && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="font-semibold text-amber-900">Forward to branch</p>
          {c.suggestedBranchId && !c.branchId && <p className="text-xs text-amber-800">Suggested from the location: <b>{brName(c.suggestedBranchId)}</b>. Check on the map if unsure.</p>}
          <div className="flex gap-2">
            <select className="input flex-1" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Branch"><option value="">Choose branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <button className="btn bg-amber-600 text-white hover:bg-amber-700" disabled={!to || to === c.branchId || !!busy} onClick={() => save({ branchId: to, ...(note.trim() ? { note } : {}) }, `Forwarded to ${brName(to)}`)}><Send size={16} />Forward</button>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <p className="font-semibold text-slate-900">Update</p>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{COMPLAINT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <textarea className="input min-h-[70px]" maxLength={1000} placeholder="Note (what was done, e.g. called at 4 pm, visit tomorrow)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary w-full" disabled={!!busy || (status === c.status && !note.trim())} onClick={() => save({ ...(status !== c.status ? { status } : {}), ...(note.trim() ? { note } : {}) }, status !== c.status ? `Status: ${status}` : 'Note saved')}>{busy ? <Loader2 size={17} className="animate-spin" /> : 'Save'}</button>
        <p className="text-[11px] text-slate-500">Any status change or note restarts the 48-hour reminder.</p>
      </div>
      {err && <p className="text-sm font-medium text-red-600">{err}</p>}

      <div>
        <p className="mb-1 font-semibold text-slate-900">History</p>
        <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
          {[...c.history].reverse().map((h, i) => (
            <li key={i} className="text-xs">
              <p className="text-slate-500">{when(h.at)} · {h.byName}</p>
              <p className="font-medium text-slate-800">{h.action}</p>
              {h.note && <p className="text-slate-600">“{h.note}”</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
