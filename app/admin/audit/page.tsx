'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoadCounter } from '@/components/Infinite';
import { ChevronDown } from 'lucide-react';
import type { AuditEntry } from '@/lib/types';
import { MODULES } from '@/lib/config';
import { api } from '@/lib/api';
import { useBranches, useSession } from '@/lib/store';

const ACTIONS = ['create', 'update', 'status', 'delete', 'restore', 'purge', 'login', 'login_failed', 'logout', 'password_change', 'password_reset', 'upload', 'import', 'backup'];
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const tone = (a: string) => (/delete|purge|failed/.test(a) ? 'bg-red-50 text-red-700' : /create|restore|import/.test(a) ? 'bg-emerald-50 text-emerald-700' : /update|status|password/.test(a) ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600');

export default function Audit() {
  const me = useSession();
  const branches = useBranches();
  const [f, setF] = useState({ action: '', docType: '', branchId: '', from: '', to: '', q: '' });
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const obs = useRef<IntersectionObserver | null>(null);

  const load = useCallback(async (skip = 0) => {
    setLoading(true); setError('');
    const qs = new URLSearchParams({ skip: String(skip), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
    try {
      const r = await api<{ entries: AuditEntry[]; hasMore: boolean; total: number }>('/api/audit?' + qs);
      setRows(skip ? (prev) => [...prev, ...r.entries] : r.entries); setMore(r.hasMore);
      if (r.total >= 0) setTotal(r.total);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load'); }
    setLoading(false);
  }, [f]);
  useEffect(() => { const t = setTimeout(() => load(0), 250); return () => clearTimeout(t); }, [load]);
  // next 50 entries load by themselves when the end of the list comes into view
  const sentinel = useCallback((el: HTMLElement | null) => {
    obs.current?.disconnect();
    if (!el || !more || loading) return;
    obs.current = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) load(rows.length); }, { rootMargin: '300px 0px' });
    obs.current.observe(el);
  }, [more, loading, load, rows.length]);
  if (me && me.role !== 'admin') return <p className="py-10 text-center text-slate-500">Only the admin can open the audit log.</p>;

  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <div><label className="label">{label}</label><select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">All</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">Audit log</h1><p className="text-xs text-slate-500">Who did what, and when. Entries cannot be edited.</p></div>
      <section className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-6">
        <div className="col-span-2"><label className="label">Search</label><input className="input" placeholder="Document number or text" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        {sel('action', 'Action', ACTIONS.map((a) => [a, a.replace('_', ' ')]))}
        {sel('docType', 'Document', MODULES.map((m) => [m.slug, m.title]))}
        {sel('branchId', 'Branch', branches.map((b) => [b.id, b.name]))}
        <div><label className="label">From</label><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="card divide-y divide-slate-100">
        {rows.map((e) => (
          <li key={e.id} className="p-3.5 text-sm">
            <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)} disabled={!e.changes?.length}>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone(e.action)}`}>{e.action.replace('_', ' ')}</span>
              <span className="min-w-0 flex-1"><span className="block break-words font-medium text-slate-900">{e.summary}</span>
                <span className="block text-xs text-slate-500">{e.userName} ({e.role}){e.branchId ? ` · ${branches.find((b) => b.id === e.branchId)?.name ?? ''}` : ''} · {when(e.at)}</span></span>
              {!!e.changes?.length && <ChevronDown size={16} className={`mt-1 shrink-0 text-slate-400 transition ${open === e.id ? 'rotate-180' : ''}`} />}
            </button>
            {open === e.id && (
              <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-2.5 text-xs">
                {e.changes!.map((c, i) => <li key={i} className="break-words"><b className="text-slate-700">{c.field}:</b> <span className="text-slate-500 line-through">{c.from || '(empty)'}</span> <span className="text-slate-900">{c.to || '(empty)'}</span></li>)}
              </ul>
            )}
          </li>
        ))}
        {!rows.length && !loading && <li className="p-8 text-center text-sm text-slate-500">No entries match.</li>}
      </ul>
      {loading && <p className="text-center text-sm text-slate-400">Loading…</p>}
      {more && !loading && <div ref={sentinel} className="py-2 text-center"><button className="text-xs text-brand-700 underline" onClick={() => load(rows.length)}>Show more</button></div>}
      <LoadCounter shown={rows.length} total={Math.max(total, rows.length)} />
    </div>
  );
}
