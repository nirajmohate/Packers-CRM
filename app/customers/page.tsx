'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowDownUp, BarChart3, ClipboardList, Download, FileText, Loader2, MessageCircle, MoreHorizontal, Pencil, Phone, ReceiptText, Search, SlidersHorizontal, Trash2, UserPlus, X } from 'lucide-react';
import { fmtDate, fmtPhone, todayISO } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { ApiFail, useBranches, useSession } from '@/lib/store';
import { deleteLead, saveLead, useLeads } from '@/lib/leadStore';
import { ITEM_TYPES, LEAD_SOURCES, LEAD_STATUSES, LEAD_TONE, LEAD_TYPES, SHIFTING_TYPES, type Lead, type LeadInput } from '@/lib/leads';
import { canUseType } from '@/lib/roles';
import { BY_SLUG } from '@/lib/config';
import { exportSheets, type Cell } from '@/lib/export';
import { Sheet, Toast, useConfirm } from '@/components/ui';
import DateRangeBar, { useDateRange } from '@/components/DateRangeBar';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';

const ROW: Record<string, string> = { red: 'bg-red-50/70', blue: 'bg-sky-50/70', green: 'bg-emerald-50/70', grey: 'bg-slate-50' };
const PILL: Record<string, string> = { red: 'bg-red-100 text-red-700 ring-red-300', blue: 'bg-sky-100 text-sky-800 ring-sky-300', green: 'bg-emerald-100 text-emerald-800 ring-emerald-300', grey: 'bg-slate-100 text-slate-600 ring-slate-300' };
const SORTS = ['Newest first', 'Oldest first', 'Name A to Z', 'Follow-up date', 'Shifting date'] as const;
type Sort = (typeof SORTS)[number];
interface Filters { branch: string; status: string; source: string; ltype: string; shift: string; item: string; sort: Sort }
const NO_FILTER: Filters = { branch: '', status: '', source: '', ltype: '', shift: '', item: '', sort: 'Newest first' };
const EMPTY: LeadInput = { name: '', email: '', phone: '', leadDate: '', moveDate: '', followUpDate: '', fromCity: '', toCity: '', fromAddress: '', toAddress: '', leadSource: '', leadType: '', shiftingType: '', itemType: '', status: 'Lead generated', remarks: '', branchId: '' };
const monthKey = (iso: string) => iso.slice(0, 7);
const monthName = (k: string) => new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

export default function CustomersPage() {
  return <Suspense fallback={null}><Customers /></Suspense>;
}

function Customers() {
  const me = useSession();
  const admin = me?.role === 'admin';
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 p-4 text-white shadow-sm">
        <h1 className="text-xl font-bold">Customers</h1>
        <p className="text-xs text-white/85">{admin ? 'Customers and leads of every branch' : 'Customers and leads of your branch'} · add the customer here first, then make the quotation or bill</p>
      </div>
      <Leads />
    </div>
  );
}

/* ====================================================== leads ====================================================== */
function Leads() {
  const me = useSession();
  const admin = me?.role === 'admin';
  const isTeam = me?.role === 'team';
  const branches = useBranches();
  const { leads, loaded, loading, error } = useLeads();
  const [range, setRange] = useDateRange('pm_leads_range', '3m');
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(NO_FILTER);
  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState<{ id: string | null; v: LeadInput } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [rowMenu, setRowMenu] = useState<Lead | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [ask, confirmDialog] = useConfirm();
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  const brName = (id: string) => branches.find((b) => b.id === id)?.name ?? '-';
  const patch = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));

  // date + branch + search: the base for the status counts and the monthly summary
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    const sd = phoneDigits(q);
    return leads.filter((l) => l.leadDate >= range.from && l.leadDate <= range.to
      && (!f.branch || l.branchId === f.branch)
      && (!f.source || l.leadSource === f.source) && (!f.ltype || l.leadType === f.ltype) && (!f.shift || l.shiftingType === f.shift) && (!f.item || l.itemType === f.item)
      && (!s || `${l.name} ${l.email} ${l.fromCity} ${l.toCity} ${l.remarks}`.toLowerCase().includes(s) || (sd.length >= 3 && phoneDigits(l.phone).includes(sd))));
  }, [leads, range, f.branch, f.source, f.ltype, f.shift, f.item, q]);

  const list = useMemo(() => {
    const out = base.filter((l) => !f.status || l.status === f.status);
    const by: Record<Sort, (a: Lead, b: Lead) => number> = {
      'Newest first': (a, b) => b.leadDate.localeCompare(a.leadDate) || b.createdAt.localeCompare(a.createdAt),
      'Oldest first': (a, b) => a.leadDate.localeCompare(b.leadDate) || a.createdAt.localeCompare(b.createdAt),
      'Name A to Z': (a, b) => (a.name || a.phone).localeCompare(b.name || b.phone),
      'Follow-up date': (a, b) => (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999'),
      'Shifting date': (a, b) => (a.moveDate || '9999').localeCompare(b.moveDate || '9999'),
    };
    return out.sort(by[f.sort]);
  }, [base, f.status, f.sort]);

  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const l of base) c[l.status] = (c[l.status] ?? 0) + 1; return c; }, [base]);

  // admin: month × branch, leads generated vs converted
  const summary = useMemo(() => {
    const m = new Map<string, { month: string; branchId: string; total: number; converted: number; lost: number }>();
    for (const l of base) {
      const k = monthKey(l.leadDate) + '|' + l.branchId;
      const r = m.get(k) ?? { month: monthKey(l.leadDate), branchId: l.branchId, total: 0, converted: 0, lost: 0 };
      r.total += 1;
      if (l.status === 'Converted') r.converted += 1;
      if (l.status === 'Lost' || l.status === 'Not responded') r.lost += 1;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.month.localeCompare(a.month) || brName(a.branchId).localeCompare(brName(b.branchId)));
  }, [base, branches]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showSummary, setShowSummary] = useState(true);

  const filterCount = [f.branch, f.status, f.source, f.ltype, f.shift, f.item].filter(Boolean).length + (f.sort !== 'Newest first' ? 1 : 0);
  const [shown, sentinel, more] = useInfinite(list.length, JSON.stringify([q, f, range.from, range.to]));

  const open = (l?: Lead) => {
    setErrs({});
    setForm(l ? { id: l.id, v: { ...l } } : { id: null, v: { ...EMPTY, leadDate: todayISO(), branchId: admin ? f.branch || '' : me?.branchId ?? '' } });
  };
  // sidebar "Add customer" opens the form straight away
  const sp = useSearchParams();
  const router = useRouter();
  // "First add the customer" from a new quotation / bill: after saving, go back to that form with the customer filled in
  const [then, setThen] = useState('');
  useEffect(() => {
    if (sp.get('add') === '1') {
      const t = sp.get('then') ?? '';
      setThen(t && BY_SLUG[t] && canUseType(me, t) ? t : '');
      open();
      router.replace('/customers');
    }
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const setV = (k: keyof LeadInput, v: string) => setForm((x) => (x ? { ...x, v: { ...x.v, [k]: v } } : x));

  const submit = async () => {
    if (!form) return;
    const v = form.v;
    const e: Record<string, string> = {};
    if (!(v.name ?? '').trim() && !(v.phone ?? '').trim()) e.name = 'Enter a name or mobile number';
    if (v.phone && phoneDigits(v.phone).length !== 10 && !/^\+/.test(v.phone.trim())) e.phone = 'Enter a 10-digit mobile number';
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Enter a valid email';
    if (admin && !form.id && !v.branchId) e.branchId = 'Choose a branch';
    setErrs(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body: LeadInput = { ...v };
      if (!admin) delete body.branchId;
      const keep = ['name', 'email', 'phone', 'leadDate', 'moveDate', 'followUpDate', 'fromCity', 'toCity', 'fromAddress', 'toAddress', 'leadSource', 'leadType', 'shiftingType', 'itemType', 'status', 'remarks', 'branchId'];
      for (const k of Object.keys(body)) if (!keep.includes(k)) delete (body as Record<string, unknown>)[k];
      const saved = await saveLead(form.id, body);
      setForm(null);
      say(form.id ? 'Customer updated' : 'Customer added');
      if (!form.id && then) { const t = then; setThen(''); router.push(`/docs/${t}/new?lead=${saved.id}`); return; }
      if (!form.id) setRowMenu(saved); // offer "Create quotation" straight away
    } catch (err) {
      if (err instanceof ApiFail && err.fields) setErrs(err.fields);
      say((err as Error).message);
    } finally { setSaving(false); }
  };

  const setStatus = async (l: Lead, status: string) => {
    if (status === l.status) return;
    if (!(await ask({ title: 'Change status?', message: <>Change <b>{l.name || fmtPhone(l.phone)}</b> from <b>{l.status}</b> to <b>{status}</b>?</>, confirmLabel: 'Yes, change', tone: LEAD_TONE[status] === 'green' ? 'green' : LEAD_TONE[status] === 'red' ? 'red' : 'blue' }))) return;
    try { await saveLead(l.id, { status }); say('Status changed'); } catch (err) { say((err as Error).message); }
  };

  const remove = async (l: Lead) => {
    setRowMenu(null);
    if (!(await ask({ title: 'Delete this customer?', message: <>This removes <b>{l.name || fmtPhone(l.phone)}</b> from your leads. Documents already made for them are not touched.</>, confirmLabel: 'Yes, delete', tone: 'red' }))) return;
    try { await deleteLead(l.id); say('Customer deleted'); } catch (err) { say((err as Error).message); }
  };

  const doExport = async (fmt: 'xlsx' | 'csv') => {
    setExportOpen(false);
    const head: Cell[] = ['Customer name', 'Email', 'Mobile', 'Date', 'From', 'To', 'Lead source', 'Lead type', 'Shifting type', 'Item type', 'Status', 'Shifting date', 'Follow-up date', 'From address', 'To address', 'Remarks', 'Documents', 'Branch', 'Added by'];
    const rows: Cell[][] = [head, ...list.map((l) => [l.name, l.email, fmtPhone(l.phone), fmtDate(l.leadDate), l.fromCity, l.toCity, l.leadSource, l.leadType, l.shiftingType, l.itemType, l.status, l.moveDate ? fmtDate(l.moveDate) : '', l.followUpDate ? fmtDate(l.followUpDate) : '', l.fromAddress, l.toAddress, l.remarks, l.docs.map((d) => d.number).join(', '), brName(l.branchId), l.createdByName])];
    const sum: Cell[][] = [['Month', 'Branch', 'Leads generated', 'Converted', 'Not responded / lost', 'Conversion %'], ...summary.map((r) => [monthName(r.month), brName(r.branchId), r.total, r.converted, r.lost, r.total ? Math.round((r.converted / r.total) * 1000) / 10 : 0])];
    await exportSheets([{ name: 'Customers', rows }, { name: 'Monthly summary', rows: sum }], `customers-${todayISO()}`, fmt);
  };

  const sel = (label: string, value: string, opts: readonly string[], on: (v: string) => void, all = 'All') => (
    <div><label className="label">{label}</label><select className="input" value={value} onChange={(e) => on(e.target.value)}><option value="">{all}</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></div>
  );
  const field = (k: keyof LeadInput, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, half = true) => (
    <div className={half ? 'col-span-2 min-[380px]:col-span-1' : 'col-span-2'}>
      <label className="label" htmlFor={'l-' + k}>{label}</label>
      <input id={'l-' + k} className={`input ${errs[k] ? 'border-red-400' : ''}`} value={form?.v[k] ?? ''} onChange={(e) => setV(k, e.target.value)} {...extra} />
      {errs[k] && <p className="mt-1 text-xs text-red-600">{errs[k]}</p>}
    </div>
  );
  const pick = (k: keyof LeadInput, label: string, opts: readonly string[], blank = 'Choose') => (
    <div className="col-span-2 min-[380px]:col-span-1">
      <label className="label" htmlFor={'l-' + k}>{label}</label>
      <select id={'l-' + k} className="input" value={form?.v[k] ?? ''} onChange={(e) => setV(k, e.target.value)}>{blank && <option value="">{blank}</option>}{opts.map((o) => <option key={o}>{o}</option>)}</select>
    </div>
  );
  const mayMake = (t: string) => canUseType(me, t);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => open()}><UserPlus size={17} />Add customer</button>
        <button className="btn-ghost" onClick={() => setPanel(true)}><SlidersHorizontal size={17} />Filters{filterCount > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-[11px] text-white">{filterCount}</span>}</button>
        {!isTeam && <button className="btn-ghost" onClick={() => setExportOpen(true)} disabled={!list.length}><Download size={17} />Export</button>}
        {admin && <select aria-label="Branch" className="input w-auto min-w-[150px] flex-1 sm:flex-none" value={f.branch} onChange={(e) => patch({ branch: e.target.value })}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      </div>
      <DateRangeBar range={range} onChange={setRange} />
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input className="input pl-10" placeholder="Search name, mobile, email, city…" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-500" onClick={() => setQ('')} aria-label="Clear search"><X size={16} /></button>}
      </div>

      {/* status chips with counts */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        <button onClick={() => patch({ status: '' })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${!f.status ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-300'}`}>All {base.length}</button>
        {LEAD_STATUSES.map((s) => (
          <button key={s} onClick={() => patch({ status: f.status === s ? '' : s })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${f.status === s ? 'bg-violet-600 text-white ring-violet-600' : PILL[LEAD_TONE[s]]}`}>{s} {counts[s] ?? 0}</button>
        ))}
      </div>

      {summary.length > 0 && (
        <div className="card overflow-hidden">
          <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-slate-800" onClick={() => setShowSummary((v) => !v)} aria-expanded={showSummary}>
            <BarChart3 size={17} className="text-violet-600" />Monthly leads vs converted{admin ? ' (per branch)' : ''}<span className="ml-auto text-xs font-normal text-slate-500">{showSummary ? 'Hide' : 'Show'}</span>
          </button>
          {showSummary && (
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead><tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600"><th className="px-3 py-2">Month</th>{admin && <th className="px-3 py-2">Branch</th>}<th className="px-3 py-2 text-right">Leads</th><th className="px-3 py-2 text-right">Converted</th><th className="px-3 py-2 text-right">Lost / no reply</th><th className="px-3 py-2">Conversion</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {summary.map((r) => {
                    const pct = r.total ? Math.round((r.converted / r.total) * 100) : 0;
                    return (
                      <tr key={r.month + r.branchId}>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{monthName(r.month)}</td>
                        {admin && <td className="whitespace-nowrap px-3 py-2 text-slate-700">{brName(r.branchId)}</td>}
                        <td className="px-3 py-2 text-right font-semibold text-red-700">{r.total}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{r.converted}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{r.lost}</td>
                        <td className="px-3 py-2"><span className="flex items-center gap-2"><span className="h-2 w-20 overflow-hidden rounded-full bg-slate-200"><span className="block h-full bg-emerald-500" style={{ width: pct + '%' }} /></span><span className="text-xs font-semibold text-slate-700">{pct}%</span></span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error ? <div className="card p-6 text-center text-sm text-red-600">{error}</div>
        : !loaded || loading && !leads.length ? <div className="card flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Loading customers…</div>
          : list.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              {leads.length ? 'No customers match these filters.' : 'No customers yet. Tap "Add customer" to save a new lead.'}
              {(filterCount > 0 || q) && <button className="mt-3 block w-full text-violet-700 underline" onClick={() => { setF(NO_FILTER); setQ(''); }}>Clear filters</button>}
            </div>
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead><tr className="bg-violet-600 text-xs uppercase tracking-wide text-white">
                    <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">From → To</th>
                    <th className="px-3 py-2.5">Lead source</th><th className="px-3 py-2.5">Lead type</th><th className="px-3 py-2.5">Shifting type</th><th className="px-3 py-2.5">Item type</th>
                    {admin && <th className="px-3 py-2.5">Branch</th>}<th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Action</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {list.slice(0, shown).map((l, i) => (
                      <tr key={l.id} className={ROW[LEAD_TONE[l.status] ?? 'blue']}>
                        <td className="px-3 py-2 font-semibold text-slate-500">{i + 1}.</td>
                        <td className="max-w-[220px] px-3 py-2">
                          <span className="block truncate font-semibold uppercase text-fuchsia-700">{l.name || '—'}</span>
                          <span className="block truncate text-xs text-slate-600">{fmtPhone(l.phone) || 'No mobile'}{l.email && <> · {l.email}</>}</span>
                          {l.followUpDate && l.status !== 'Converted' && <span className={`block text-[11px] font-semibold ${l.followUpDate <= todayISO() ? 'text-red-600' : 'text-amber-700'}`}>Follow-up {fmtDate(l.followUpDate)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fmtDate(l.leadDate)}</td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-slate-700">{l.fromCity || '—'} → {l.toCity || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{l.leadSource || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2">{l.leadType ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.leadType === 'Hot' ? 'bg-red-100 text-red-700' : l.leadType === 'Warm' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{l.leadType}</span> : '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{l.shiftingType || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-700">{l.itemType || '—'}</td>
                        {admin && <td className="whitespace-nowrap px-3 py-2 text-slate-700">{brName(l.branchId)}</td>}
                        <td className="px-3 py-2">
                          <select aria-label="Status" className={`rounded-full border-0 py-1 pl-2.5 pr-7 text-xs font-semibold ring-1 ${PILL[LEAD_TONE[l.status] ?? 'blue']}`} value={l.status} onChange={(e) => setStatus(l, e.target.value)}>
                            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><span className="flex justify-end gap-1.5">
                          {l.phone && <a href={`tel:${l.phone}`} aria-label="Call" className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-sky-700"><Phone size={15} /></a>}
                          <button onClick={() => setRowMenu(l)} aria-label="More actions" className="btn min-h-[32px] bg-indigo-600 px-2.5 text-white hover:bg-indigo-700"><MoreHorizontal size={16} /></button>
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <LoadMore shown={shown} total={list.length} sentinel={sentinel} more={more} />
              <LoadCounter shown={shown} total={list.length} />
            </>
          )}

      {/* ⋯ menu */}
      <Sheet open={!!rowMenu} onClose={() => setRowMenu(null)} title={rowMenu ? rowMenu.name || fmtPhone(rowMenu.phone) || 'Customer' : ''}>
        {rowMenu && (
          <div className="grid gap-2">
            <p className="text-xs text-slate-500">Create a document for this customer. Name, mobile, email, cities and dates are filled in for you.</p>
            {mayMake('quotation') && <Link href={`/docs/quotation/new?lead=${rowMenu.id}`} className="btn bg-red-600 text-white hover:bg-red-700"><FileText size={17} />Create quotation</Link>}
            {mayMake('survey') && <Link href={`/docs/survey/new?lead=${rowMenu.id}`} className="btn bg-sky-600 text-white hover:bg-sky-700"><ClipboardList size={17} />Create survey</Link>}
            {mayMake('bill') && <Link href={`/docs/bill/new?lead=${rowMenu.id}`} className="btn bg-emerald-600 text-white hover:bg-emerald-700"><ReceiptText size={17} />Create bill</Link>}
            {rowMenu.docs.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600">Made for this customer: {rowMenu.docs.map((d, i) => <span key={d.id}>{i ? ', ' : ''}<Link className="font-semibold text-violet-700 underline" href={`/docs/${d.type}/view?id=${d.id}`}>{d.number}</Link></span>)}</div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => { const l = rowMenu; setRowMenu(null); open(l); }} className="btn bg-amber-500 text-white hover:bg-amber-600"><Pencil size={17} />Edit</button>
              {rowMenu.phone ? <a href={`https://wa.me/${phoneDigits(rowMenu.phone).length === 10 ? '91' + phoneDigits(rowMenu.phone) : phoneDigits(rowMenu.phone)}`} target="_blank" rel="noreferrer" className="btn bg-emerald-100 text-emerald-800"><MessageCircle size={17} />WhatsApp</a> : <span />}
            </div>
            {!isTeam && <button onClick={() => remove(rowMenu)} className="btn border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"><Trash2 size={17} />Delete</button>}
          </div>
        )}
      </Sheet>

      {/* add / edit */}
      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit customer' : 'Add customer'}>
        {form && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="grid grid-cols-2 gap-3">
              {field('name', 'Customer name', { maxLength: 80, autoFocus: true }, false)}
              {field('phone', 'Mobile no.', { type: 'tel', inputMode: 'tel', maxLength: 16, placeholder: '98765 43210' })}
              {field('email', 'Email', { type: 'email', maxLength: 120, autoCapitalize: 'none' })}
              {field('leadDate', 'Date', { type: 'date' })}
              {pick('status', 'Status', LEAD_STATUSES, '')}
              {field('fromCity', 'From', { maxLength: 60 })}
              {field('toCity', 'To', { maxLength: 60 })}
              {pick('leadSource', 'Lead source', LEAD_SOURCES)}
              {pick('leadType', 'Lead type', LEAD_TYPES)}
              {pick('shiftingType', 'Shifting type', SHIFTING_TYPES)}
              {pick('itemType', 'Item type', ITEM_TYPES)}
              {field('moveDate', 'Shifting date', { type: 'date' })}
              {field('followUpDate', 'Follow-up date', { type: 'date' })}
              {field('fromAddress', 'From address', { maxLength: 300 }, false)}
              {field('toAddress', 'To address', { maxLength: 300 }, false)}
              <div className="col-span-2"><label className="label" htmlFor="l-remarks">Remarks</label><textarea id="l-remarks" className="input min-h-[70px]" maxLength={1000} value={form.v.remarks ?? ''} onChange={(e) => setV('remarks', e.target.value)} /></div>
              {admin && (
                <div className="col-span-2"><label className="label" htmlFor="l-branch">Branch</label>
                  <select id="l-branch" className={`input ${errs.branchId ? 'border-red-400' : ''}`} value={form.v.branchId ?? ''} onChange={(e) => setV('branchId', e.target.value)}>
                    <option value="">Choose</option>{branches.filter((b) => b.active !== false || b.id === form.v.branchId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>{errs.branchId && <p className="mt-1 text-xs text-red-600">{errs.branchId}</p>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Save customer'}</button>
            </div>
          </form>
        )}
      </Sheet>

      {/* filters */}
      <Sheet open={panel} onClose={() => setPanel(false)} title="Filter customers">
        <div className="space-y-3">
          {admin && <div><label className="label">Branch</label><select className="input" value={f.branch} onChange={(e) => patch({ branch: e.target.value })}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
          {sel('Status', f.status, LEAD_STATUSES, (v) => patch({ status: v }))}
          {sel('Lead source', f.source, LEAD_SOURCES, (v) => patch({ source: v }))}
          {sel('Lead type', f.ltype, LEAD_TYPES, (v) => patch({ ltype: v }))}
          {sel('Shifting type', f.shift, SHIFTING_TYPES, (v) => patch({ shift: v }))}
          {sel('Item type', f.item, ITEM_TYPES, (v) => patch({ item: v }))}
          <div><label className="label flex items-center gap-1.5"><ArrowDownUp size={14} />Sort by</label><select className="input" value={f.sort} onChange={(e) => patch({ sort: e.target.value as Sort })}>{SORTS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button className="btn-ghost" onClick={() => setF(NO_FILTER)}>Clear all</button>
            <button className="btn-primary" onClick={() => setPanel(false)}>Show {list.length}</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={`Export ${list.length} customer${list.length === 1 ? '' : 's'}`}>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-primary" onClick={() => doExport('xlsx')}>Excel (.xlsx)</button>
          <button className="btn-ghost" onClick={() => doExport('csv')}>CSV</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Exports every customer that matches the date, search and filters. The Excel file also has a &quot;Monthly summary&quot; sheet (leads vs converted{admin ? ' per branch' : ''}).</p>
      </Sheet>

      {confirmDialog}
      <Toast msg={msg} />
    </div>
  );
}

