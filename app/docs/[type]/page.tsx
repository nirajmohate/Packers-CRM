'use client';
import ShareButtons from '@/components/ShareButtons';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, CalendarDays, Download, Eye, FileDown, Link2, Loader2, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { BY_SLUG, CONVERT } from '@/lib/config';
import { docCalc } from '@/lib/ledger';
import { fmtDate, fmtPhone, inr, todayISO } from '@/lib/format';
import { fyOf } from '@/lib/numbering';
import { docRows, exportSheets, partyOf } from '@/lib/export';
import { ensureSince, useSession, useActiveBranch, useBranches, useDocs, useHomeState, useSince } from '@/lib/store';
import { ModuleIcon, Sheet } from '@/components/ui';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';
import SurveyLinkSheet from '@/components/SurveyLinkSheet';
import { ROW_TONE, StatusSelect, toneOf, useStatusChanger } from '@/components/StatusControl';
import { useDeleteDoc } from '@/components/DeleteDialog';
import { canDelete, canUseType } from '@/lib/roles';
import { usePdfDownload } from '@/lib/usePdf';

const PERIODS = ['Any date', 'Today', 'Last 7 days', 'This month', 'Last month', 'Last 3 months', 'This financial year', 'Last financial year', 'Custom range'] as const;
type Period = (typeof PERIODS)[number];
const SORTS = ['Newest first', 'Oldest first', 'Amount: high to low', 'Amount: low to high', 'Name: A to Z'] as const;
type SortBy = (typeof SORTS)[number];
const STEP = 10; // rows added each time you scroll near the end

interface Filters { q: string; status: string; period: Period; from: string; to: string; dateOf: 'docDate' | 'moveDate'; sort: SortBy; city: string; min: string; max: string }
const EMPTY: Filters = { q: '', status: 'All', period: 'Any date', from: '', to: '', dateOf: 'docDate', sort: 'Newest first', city: '', min: '', max: '' };

/** Date range [from, to] for a period; '' means open-ended. */
function rangeOf(p: Period, from: string, to: string): [string, string] {
  const now = new Date();
  const iso = (d: Date) => todayISO(d);
  const today = iso(now);
  switch (p) {
    case 'Today': return [today, today];
    case 'Last 7 days': return [iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), today];
    case 'This month': return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    case 'Last month': return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
    case 'Last 3 months': return [iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), today];
    case 'This financial year':
    case 'Last financial year': {
      const start = Number(fyOf(today).slice(0, 4)) - (p === 'Last financial year' ? 1 : 0);
      return [`${start}-04-01`, `${start + 1}-03-31`];
    }
    case 'Custom range': return from && to && from > to ? [to, from] : [from, to];
    default: return ['', ''];
  }
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

/** Filters are kept for this browser tab, so they are still there when you come back from a document. */
function useSavedFilters(type: string): [Filters, (p: Partial<Filters>) => void, () => void] {
  const key = `pm_filters_${type}`;
  const [f, setF] = useState<Filters>(EMPTY);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v === 'object') {
        const clean: Filters = { ...EMPTY };
        for (const k of Object.keys(EMPTY) as (keyof Filters)[]) if (typeof v[k] === 'string') (clean as unknown as Record<string, string>)[k] = String(v[k]).slice(0, 200);
        if (!PERIODS.includes(clean.period)) clean.period = 'Any date';
        if (!SORTS.includes(clean.sort)) clean.sort = 'Newest first';
        if (clean.dateOf !== 'moveDate') clean.dateOf = 'docDate';
        setF(clean);
      } else setF(EMPTY);
    } catch { setF(EMPTY); }
  }, [key]);
  const save = (next: Filters) => { try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } };
  const patch = (p: Partial<Filters>) => setF((cur) => { const next = { ...cur, ...p }; save(next); return next; });
  const reset = () => { setF(EMPTY); save(EMPTY); };
  return [f, patch, reset];
}

export default function DocListPage() {
  return <Suspense fallback={null}><DocList /></Suspense>;
}

function DocList() {
  const { type } = useParams<{ type: string }>();
  const cfg = BY_SLUG[type];
  const docs = useDocs();
  const home = useHomeState();
  const branches = useBranches();
  const since = useSince();
  const [active] = useActiveBranch();
  const [f, patch, reset] = useSavedFilters(type);
  const [panel, setPanel] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState<DocRecord | null>(null);
  const [linkSheet, setLinkSheet] = useState(false);
  const [pdfBusy, setPdfBusy] = useState('');
  const [pdfErr, setPdfErr] = useState('');
  const downloadPdf = usePdfDownload();
  const me = useSession();
  // "Make quotation / bill…" only for the types this account can use
  const convertTo = (CONVERT[type] ?? []).filter((t) => canUseType(me, t));
  const [changeStatus, statusElements, statusBusy] = useStatusChanger();
  const [askDelete, deleteDialog] = useDeleteDoc();
  // the side menu's "Share survey link" opens this page with ?share=1
  const shareParam = useSearchParams().get('share');
  const router = useRouter();
  useEffect(() => {
    if (type === 'survey' && shareParam === '1') { setLinkSheet(true); router.replace('/docs/survey'); }
  }, [type, shareParam, router]);
  useEffect(() => {
    if (type !== 'survey') return;
    const open = () => setLinkSheet(true);
    window.addEventListener('pm-share-survey', open);
    return () => window.removeEventListener('pm-share-survey', open);
  }, [type]);
  const [loadingOld, setLoadingOld] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  const hasMoveDate = !!cfg?.sections.some((s) => s.fields.some((x) => x.key === 'moveDate'));
  const hasCity = !!cfg?.sections.some((s) => s.fields.some((x) => x.key === 'fromCity'));
  const hasAmount = !!(cfg?.money || cfg?.calc);
  const dateOf = hasMoveDate ? f.dateOf : 'docDate';
  const [lo, hi] = rangeOf(f.period, f.from, f.to);

  // documents older than what was loaded at sign-in are fetched only when a filter asks for them
  useEffect(() => {
    if (dateOf !== 'docDate' || !lo || !isDate(lo) || !since || lo >= since) return;
    let stop = false;
    setLoadingOld(true); setLoadErr('');
    ensureSince(lo).catch((e) => { if (!stop) setLoadErr(e instanceof Error ? e.message : 'Could not load older documents'); }).finally(() => { if (!stop) setLoadingOld(false); });
    return () => { stop = true; };
  }, [lo, since, dateOf]);

  const all = useMemo(
    () => (cfg ? docs.filter((d) => d.type === type).map((d) => ({ d, c: docCalc(d, cfg, docs, home(d.branchId)) })) : []),
    [docs, type, cfg, home],
  );

  const list = useMemo(() => {
    if (!cfg) return [];
    const q = f.q.trim().toLowerCase();
    const city = f.city.trim().toLowerCase();
    const min = num(f.min), max = num(f.max);
    const out = all
      .filter(({ c }) => f.status === 'All' || c.status === f.status)
      .filter(({ d }) => {
        if (!lo && !hi) return true;
        const v = dateOf === 'moveDate' ? d.data.moveDate || '' : d.docDate;
        if (!v) return false;
        return (!lo || v >= lo) && (!hi || v <= hi);
      })
      .filter(({ d }) => !city || `${d.data.fromCity ?? ''} ${d.data.toCity ?? ''}`.toLowerCase().includes(city))
      .filter(({ c }) => !hasAmount || ((min === null || c.total >= min) && (max === null || c.total <= max)))
      .filter(({ d }) => !q || JSON.stringify([d.number, d.data]).toLowerCase().includes(q));
    const byDate = (a: (typeof out)[number], b: (typeof out)[number]) => b.d.docDate.localeCompare(a.d.docDate) || b.d.createdAt.localeCompare(a.d.createdAt);
    switch (f.sort) {
      case 'Oldest first': return out.sort((a, b) => -byDate(a, b));
      case 'Amount: high to low': return out.sort((a, b) => b.c.total - a.c.total || byDate(a, b));
      case 'Amount: low to high': return out.sort((a, b) => a.c.total - b.c.total || byDate(a, b));
      case 'Name: A to Z': return out.sort((a, b) => partyOf(a.d, cfg).localeCompare(partyOf(b.d, cfg)) || byDate(a, b));
      default: return out.sort(byDate);
    }
  }, [all, cfg, f, lo, hi, dateOf, hasAmount]);

  // starts again from the top whenever the document type, search or filters change
  const [shown, sentinel, more] = useInfinite(list.length, type + JSON.stringify(f), STEP);

  if (!cfg) return <p className="py-10 text-center text-slate-500">Unknown document type.</p>;

  const statuses = cfg.slug === 'bill' ? ['Unpaid', 'Partial', 'Paid', 'Cancelled'] : cfg.statuses;
  const sum = list.reduce((a, x) => a + (x.c.total || 0), 0);
  const extra = [f.period !== 'Any date', !!f.city.trim(), !!f.min.trim(), !!f.max.trim(), f.sort !== 'Newest first'].filter(Boolean).length;
  const anyFilter = extra > 0 || f.status !== 'All' || !!f.q.trim();
  const exportNow = async (fmt: 'csv' | 'xlsx') => {
    setMenu(false);
    await exportSheets([{ name: cfg.title, rows: docRows(cfg, list.map((x) => x.d), docs, branches, home) }], `${cfg.short}-${todayISO()}`, fmt);
  };
  const chips: { label: string; clear: Partial<Filters> }[] = [];
  if (f.period !== 'Any date') chips.push({ label: f.period === 'Custom range' ? `${lo ? fmtDate(lo) : '…'} – ${hi ? fmtDate(hi) : '…'}` : f.period, clear: { period: 'Any date', from: '', to: '' } });
  if (f.city.trim()) chips.push({ label: `City: ${f.city.trim()}`, clear: { city: '' } });
  if (f.min.trim()) chips.push({ label: `Min ${inr(num(f.min) ?? 0)}`, clear: { min: '' } });
  if (f.max.trim()) chips.push({ label: `Max ${inr(num(f.max) ?? 0)}`, clear: { max: '' } });
  if (f.sort !== 'Newest first') chips.push({ label: f.sort, clear: { sort: 'Newest first' } });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-3 text-white shadow-sm sm:flex sm:items-center sm:gap-3" style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)` }}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white"><ModuleIcon cfg={cfg} size={40} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight sm:text-xl">{cfg.title}</h1>
            <p className="truncate text-xs text-white/90"> · Total {all.length}{active !== 'all' ? ' in this branch' : ''}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
          <Link href={`/docs/${type}/new`} className="btn min-h-[40px] flex-1 bg-white px-3 text-slate-900 hover:bg-slate-100 sm:flex-none"><Plus size={17} />New</Link>
          {cfg.slug === 'survey' && <button onClick={() => setLinkSheet(true)} className="btn min-h-[40px] flex-[1.6] bg-white/95 px-3 text-violet-700 hover:bg-white sm:flex-none"><Link2 size={17} />Share link</button>}
          <button onClick={() => setMenu(true)} disabled={!list.length} className="btn min-h-[40px] bg-white/20 px-3 text-white hover:bg-white/30" aria-label="Export"><Download size={17} /><span className="hidden sm:inline">Export</span></button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-10" placeholder="Search name, number, phone…" value={f.q} maxLength={100} onChange={(e) => patch({ q: e.target.value })} />
        </div>
        <button onClick={() => setPanel(true)} className="btn-ghost relative shrink-0" aria-label="Filters">
          <SlidersHorizontal size={18} /><span className="hidden sm:inline">Filters</span>
          {extra > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">{extra}</span>}
        </button>
      </div>

      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        {['All', ...statuses].map((s) => (
          <button key={s} onClick={() => patch({ status: s })} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${f.status === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}>{s}</button>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.label} onClick={() => patch(c.clear)} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
              {c.label}<X size={13} />
            </button>
          ))}
          <button onClick={reset} className="text-xs font-semibold text-slate-600 underline">Clear all</button>
        </div>
      )}

      {(anyFilter || loadingOld) && (
        <p className="flex items-center gap-2 px-1 text-xs text-slate-600">
          {loadingOld && <Loader2 size={14} className="animate-spin" />}
          {loadingOld ? 'Loading older documents…' : `${list.length} of ${all.length} match${hasAmount && list.length ? ` · total ${inr(sum)}` : ''}`}
        </p>
      )}
      {loadErr && <p className="px-1 text-xs text-red-600">{loadErr}</p>}

      {list.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold text-slate-900">{all.length ? 'Nothing matches your filters' : `No ${cfg.title.toLowerCase()} yet`}</p>
          {all.length > 0 && anyFilter && <button onClick={reset} className="btn-ghost mt-4">Clear filters</button>}
          {!all.length && <Link href={`/docs/${type}/new`} className="btn-primary mt-4">Create the first one</Link>}
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 text-sm font-bold" style={{ color: cfg.color }}>
              <span>All records</span>
              <span className="text-xs font-semibold text-slate-600">Showing {shown} of {list.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-white" style={{ background: cfg.color }}>
                    <th className="w-10 px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Details</th>
                    <th className="px-3 py-2.5">{cfg.party === 'payeeName' ? 'Payee' : 'Customer'}</th>
                    {hasCity && <th className="px-3 py-2.5">Location</th>}
                    {hasAmount && <th className="px-3 py-2.5 text-right">Amount</th>}
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {list.slice(0, shown).map(({ d, c }, i) => {
                    const fromCustomer = d.createdByName === 'Customer (survey link)';
                    return (
                      <tr key={d.id} className={ROW_TONE[toneOf(c.status)]}>
                        <td className="px-3 py-2.5 align-top font-semibold text-slate-500">{i + 1}.</td>
                        <td className="px-3 py-2.5 align-top">
                          <Link href={`/docs/${type}/view?id=${d.id}`} className="block whitespace-nowrap font-bold hover:underline" style={{ color: cfg.color }}>{d.number}</Link>
                          <span className="block text-xs font-semibold text-orange-600">{fmtDate(d.docDate)}</span>
                          {dateOf === 'moveDate' && d.data.moveDate && <span className="block text-[11px] text-slate-500">Moving {fmtDate(d.data.moveDate)}</span>}
                          {active === 'all' && d.branchId && <span className="block text-[11px] text-slate-400">{branches.find((b) => b.id === d.branchId)?.name}</span>}
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5 align-top">
                          <span className="block truncate font-semibold uppercase text-fuchsia-700">{partyOf(d, cfg) || '—'}</span>
                          <span className="block text-xs text-slate-500">Phone: {fmtPhone(d.data.customerPhone || d.data.payeePhone) || 'N/A'}</span>
                          {fromCustomer && <span className="mt-0.5 inline-block rounded bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700">Filled by customer</span>}
                        </td>
                        {hasCity && (
                          <td className="max-w-[200px] px-3 py-2.5 align-top text-xs">
                            <span className="block truncate"><span className="text-slate-500">From: </span><b className="text-emerald-700">{d.data.fromCity || '—'}</b></span>
                            <span className="block truncate"><span className="text-slate-500">To: </span><b className="text-red-600">{d.data.toCity || '—'}</b></span>
                          </td>
                        )}
                        {hasAmount && (
                          <td className="whitespace-nowrap px-3 py-2.5 text-right align-top">
                            <span className="block font-bold text-slate-900">{inr(c.total)}</span>
                            {cfg.slug === 'bill' && c.balance != null && c.balance > 0 && c.status !== 'Cancelled' && <span className="block text-[11px] font-semibold text-amber-700">Due {inr(c.balance)}</span>}
                          </td>
                        )}
                        <td className="px-3 py-2.5 align-top"><StatusSelect doc={d} status={c.status} disabled={statusBusy === d.id} onPick={(next) => changeStatus(d, c.status, next, c.balance ?? 0)} /></td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={async () => { setPdfErr(''); setPdfBusy(d.id); try { await downloadPdf(d); } catch (e) { console.error(e); setPdfErr('Could not create the PDF. Open the document and try again.'); } setPdfBusy(''); }}
                              disabled={!!pdfBusy} className="btn min-h-[34px] whitespace-nowrap bg-pink-600 px-2.5 text-xs text-white hover:bg-pink-700"
                            >{pdfBusy === d.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}PDF</button>
                            <button onClick={() => setRowMenu(d)} aria-label="More actions" className="btn min-h-[34px] bg-indigo-600 px-2.5 text-white hover:bg-indigo-700"><MoreHorizontal size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {pdfErr && <p className="px-1 text-xs font-medium text-red-600">{pdfErr}</p>}
          <LoadMore shown={shown} total={list.length} sentinel={sentinel} more={more} />
          <LoadCounter shown={shown} total={list.length} />
        </>
      )}


      <Sheet open={panel} onClose={() => setPanel(false)} title="Filters">
        <div className="space-y-4">
          <div>
            <label className="label flex items-center gap-1.5"><CalendarDays size={14} />Date</label>
            {hasMoveDate && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                {([['docDate', 'Document date'], ['moveDate', 'Moving date']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => patch({ dateOf: k })} className={`rounded-xl px-3 py-2 text-sm font-medium ${dateOf === k ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{l}</button>
                ))}
              </div>
            )}
            <select className="input" value={f.period} onChange={(e) => patch({ period: e.target.value as Period })}>
              {PERIODS.map((p) => <option key={p}>{p}</option>)}
            </select>
            {f.period === 'Custom range' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div><label className="label">From</label><input type="date" className="input" value={f.from} max={f.to || undefined} onChange={(e) => patch({ from: e.target.value })} /></div>
                <div><label className="label">To</label><input type="date" className="input" value={f.to} min={f.from || undefined} onChange={(e) => patch({ to: e.target.value })} /></div>
              </div>
            )}
            {since && dateOf === 'docDate' && <p className="mt-1.5 text-xs text-slate-500">Documents from {fmtDate(since)} are on this device. Pick an earlier date and the older ones are loaded for you.</p>}
          </div>

          {hasCity && (
            <div>
              <label className="label">City (from or to)</label>
              <input className="input" placeholder="e.g. Pune" value={f.city} maxLength={60} onChange={(e) => patch({ city: e.target.value })} />
            </div>
          )}

          {hasAmount && (
            <div>
              <label className="label">Amount (₹)</label>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" inputMode="decimal" placeholder="Min" value={f.min} maxLength={12} onChange={(e) => patch({ min: e.target.value.replace(/[^\d.]/g, '') })} />
                <input className="input" inputMode="decimal" placeholder="Max" value={f.max} maxLength={12} onChange={(e) => patch({ max: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
            </div>
          )}

          <div>
            <label className="label flex items-center gap-1.5"><ArrowDownUp size={14} />Sort by</label>
            <select className="input" value={f.sort} onChange={(e) => patch({ sort: e.target.value as SortBy })}>
              {SORTS.filter((s) => hasAmount || !s.startsWith('Amount')).map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button className="btn-ghost" onClick={reset}>Clear all</button>
            <button className="btn-primary" onClick={() => setPanel(false)}>Show {list.length} result{list.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={!!rowMenu} onClose={() => setRowMenu(null)} title={rowMenu ? `${rowMenu.number} · ${partyOf(rowMenu, cfg) || cfg.title}` : ''}>
        {rowMenu && (
          <div className="grid gap-2">
            <Link href={`/docs/${type}/view?id=${rowMenu.id}`} className="btn bg-sky-600 text-white hover:bg-sky-700"><Eye size={17} />View</Link>
            <Link href={`/docs/${type}/edit?id=${rowMenu.id}`} className="btn bg-amber-500 text-white hover:bg-amber-600"><Pencil size={17} />Edit</Link>
            <p className="pt-1 text-xs font-semibold text-slate-500">Share with customer (message + PDF link)</p>
            <ShareButtons rec={rowMenu} onDone={() => setRowMenu(null)} onError={(m) => { setRowMenu(null); setPdfErr(m); }} />
            {canDelete(me) && <button onClick={async () => { const d = rowMenu; setRowMenu(null); await askDelete(d); }} className="btn border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"><Trash2 size={17} />Delete</button>}
            {convertTo.length > 0 && <p className="pt-2 text-xs font-semibold text-slate-500">Create from this {cfg.title.toLowerCase()} (details are copied)</p>}
            {convertTo.map((t) => {
              const tc = BY_SLUG[t];
              return (
                <Link key={t} href={`/docs/${t}/new?from=${rowMenu.id}`} className="btn border-2 bg-white" style={{ borderColor: tc.color, color: tc.color }}>
                  <Plus size={17} />Make {tc.title}
                </Link>
              );
            })}
          </div>
        )}
      </Sheet>

      {statusElements}
      {deleteDialog}
      {cfg.slug === 'survey' && <SurveyLinkSheet open={linkSheet} onClose={() => setLinkSheet(false)} />}

      <Sheet open={menu} onClose={() => setMenu(false)} title={`Export ${list.length} ${cfg.title.toLowerCase()}`}>
        <div className="grid gap-3">
          <button className="btn-primary" onClick={() => exportNow('xlsx')}>Excel (.xlsx)</button>
          <button className="btn-ghost" onClick={() => exportNow('csv')}>CSV</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Exports everything that matches your search and filters (not only the rows loaded on screen).</p>
      </Sheet>
    </div>
  );
}
