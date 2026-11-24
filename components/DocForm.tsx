'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ChevronDown } from 'lucide-react';
import ItemsEditor from './ItemsEditor';
import CustomerPicker, { type Picked } from './CustomerPicker';
import { leadsChanged, useLeads } from '@/lib/leadStore';
import { canSee } from '@/lib/roles';
import { AutoTextarea, FieldLabel, Hi } from './ui';
import type { DocRecord, Field, ModuleConfig, Row } from '@/lib/types';
import { GST_RATES, HOUSEHOLD, SERVICE_PRESETS, suggestionNames } from '@/lib/config';
import { cftOf } from '@/lib/catalog';
import { GOODS_KEY, goodsConfig, readGoods, writeGoods } from '@/lib/goods';
import { ApiFail, clearDraft, createDoc, getRates, readDraft, rememberRates, updateDoc, useActiveBranch, useActiveBranches, useAllDocs, useCompanyFor, useHydrated, useSession, useTermsFor, writeDraft } from '@/lib/store';
import { api } from '@/lib/api';
import { docCalc, billInfo, openBills, receiptsFor } from '@/lib/ledger';
import { FREIGHT, isIgst, lineAmount, moneyCalc, moneyLines, num, round2, validRows } from '@/lib/calc';
import { amountInWords, inr, todayISO } from '@/lib/format';
import { isVisible } from '@/lib/fields';
import { cleanData, itemErrors, rowTouched, validateDoc } from '@/lib/validateDoc';
import { normalize, validateValue } from '@/lib/validate';
import { stateFromGstin } from '@/lib/states';

const blankRow = (cfg: ModuleConfig): Row => {
  const r: Row = {};
  cfg.columns?.forEach((c) => (r[c.key] = c.default ?? ''));
  return r;
};
const isUntouched = (cfg: ModuleConfig, r: Row) => cfg.columns!.every((c) => { const v = (r[c.key] || '').trim(); return v === '' || (c.default !== undefined && v === c.default); });

interface Draft { number: string; numberTouched: boolean; docDate: string; branchId: string; status: string; data: Record<string, string>; items: Row[] }
interface BillOpt { id: string; label: string; number: string; name: string; phone: string; email: string; balance: number }

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs font-medium text-red-600">{msg}</p> : null;
}

/** "Select or type" list for a text box (Moving type, Type of shipment). */
function Suggest({ f }: { f: Field }) {
  return f.suggestions ? <datalist id={'sug-' + f.key}>{f.suggestions.map((o) => <option key={o} value={o} />)}</datalist> : null;
}

function FieldInput({ f, value, error, bills, onChange, onBill }: { f: Field; value: string; error?: string; bills?: BillOpt[]; onChange: (v: string) => void; onBill?: (id: string) => void }) {
  const cls = `input ${error ? 'border-red-400 ring-2 ring-red-100' : ''} ${f.readOnly ? 'bg-slate-50 text-slate-600' : ''}`;
  const common = { id: 'f-' + f.key, 'data-err': error ? '1' : undefined } as const;
  if (f.type === 'bill')
    return (
      <select {...common} className={cls} value={value} onChange={(e) => onBill?.(e.target.value)}>
        <option value="">No bill, general receipt</option>
        {bills?.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
    );
  if (f.type === 'check')
    return (
      <label className="flex min-h-[44px] items-center gap-3 rounded-xl border-[1.5px] border-slate-300 bg-white px-3 text-sm font-medium text-slate-800">
        <input {...common} type="checkbox" className="h-5 w-5" checked={value === '1'} onChange={(e) => onChange(e.target.checked ? '1' : '')} />
        <span className="min-w-0">{f.label} <Hi t={f.label} className="block text-[11px] text-slate-400" /></span>
      </label>
    );
  if (f.type === 'textarea') return <AutoTextarea {...common} minRows={f.rows ?? 2} className={cls} value={value} placeholder={f.placeholder} maxLength={f.key === 'body' ? 20000 : 2000} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'select')
    return (
      <select {...common} className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {f.options?.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  if (f.type === 'tel')
    // +91 is shown in front; the number itself is saved as 10 digits and printed as +91 98765 43210
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center border-r border-slate-300 pl-3 pr-2 text-base font-semibold text-slate-600">+91</span>
        <input {...common} className={`${cls} pl-16`} value={value} placeholder={f.placeholder ?? '98765 43210'} readOnly={f.readOnly} maxLength={16} type="tel" inputMode="tel" autoComplete="tel-national"
          onChange={(e) => { const v = e.target.value; const d = v.replace(/\D/g, ''); onChange(/^\s*(\+|0{0,2})91/.test(v) && d.length === 12 ? d.slice(2) : v); }} />
      </div>
    );
  return (
    <input
      {...common} className={cls} value={value} placeholder={f.placeholder} readOnly={f.readOnly} list={f.suggestions ? 'sug-' + f.key : undefined} maxLength={f.type === 'number' ? 16 : 500}
      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'}
      inputMode={f.type === 'number' ? 'decimal' : f.validate === 'email' ? 'email' : undefined}
      autoCapitalize={f.upper ? 'characters' : undefined}
      step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? f.min : undefined} max={f.type === 'number' ? f.max : undefined}
      onChange={(e) => onChange(f.upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}

export default function DocForm({ cfg, initial, prefill, draftKey, leadId, leadBranch }: { cfg: ModuleConfig; initial?: DocRecord; prefill?: { data: Record<string, string>; items: Row[] }; draftKey: string; leadId?: string; leadBranch?: string }) {
  const router = useRouter();
  const allDocs = useAllDocs();
  const user = useSession();
  const isManager = !!user && user.role !== 'admin'; // branch owner or team: always their own branch
  const branches = useActiveBranches();
  const [activeBranch] = useActiveBranch();
  const companyFor = useCompanyFor();
  const termsFor = useTermsFor();
  const hydrated = useHydrated();
  const isNew = !initial;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [number, setNumber] = useState(initial?.number ?? '');
  const [numberTouched, setNumberTouched] = useState(false);
  const [docDate, setDocDate] = useState(initial?.docDate ?? '');
  const [branchId, setBranchId] = useState(initial?.branchId ?? (isManager ? user?.branchId ?? '' : leadBranch ?? ''));
  // the saved customer (lead) this new document is for: its status moves on when the document is saved
  const [linkedLead, setLinkedLead] = useState(leadId ?? '');
  const fieldKeys = useMemo(() => new Set(cfg.sections.flatMap((s) => s.fields.map((f) => f.key))), [cfg]);
  const { leads } = useLeads(isNew && canSee(user, 'customers'));
  const linkedName = linkedLead ? leads.find((l) => l.id === linkedLead)?.name ?? '' : '';
  const co = companyFor(branchId || null);
  const defaultTerms = termsFor(cfg.slug, branchId || null, cfg.terms).join('\n');
  const [status, setStatus] = useState(initial?.status ?? cfg.statuses[0]);
  // starting values: the document being edited, or the type's defaults for a new one
  const [legacyNote] = useState(() => !!(initial && cfg.freight && initial.data.calcMode !== FREIGHT && validRows(initial.items).length));
  const [data, setData] = useState<Record<string, string>>(() => {
    if (!initial) return { gstRate: '0', gstMode: 'Auto', roundOff: '1', discountType: '₹', ...(cfg.defaults ?? {}), ...(prefill?.data ?? {}) };
    // "GST Charge Hide" was renamed "Without GST …"
    if (cfg.freight && initial.data.gstShow === 'GST Charge Hide') return { ...initial.data, gstShow: `Without GST ${cfg.slug === 'bill' ? 'Bill' : 'Quotation'}` };
    if (!cfg.freight || initial.data.calcMode === FREIGHT) return initial.data;
    // made with the old "Services & charges" list: its total moves into Freight so the amount stays the same
    const rows = validRows(initial.items);
    const sub = round2(rows.reduce((a, x) => a + lineAmount(x), 0));
    const old = rows.map((x) => `${x.description} ${inr(lineAmount(x))}`).join(', ');
    return {
      ...(cfg.defaults ?? {}), ...initial.data, calcMode: FREIGHT, freight: sub ? String(sub) : initial.data.freight ?? '',
      gstMode: isIgst(initial.data, co.state) ? 'IGST' : 'CGST + SGST', roundOff: initial.data.roundOff === '1' ? '1' : '',
      notes: [initial.data.notes, old && `Earlier charges: ${old}`].filter(Boolean).join('\n'),
    };
  });
  const [items, setItems] = useState<Row[]>(() => (initial?.items?.length ? initial.items : prefill?.items ?? []).filter((x) => rowTouched(cfg, x)));
  // the "new item" boxes above the list; `editing` is the list position being changed, or null for a new item
  const [entry, setEntry] = useState<Row>(() => blankRow(cfg));
  const [editing, setEditing] = useState<number | null>(null);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  // household "Items list" (quotation / bill): kept inside data.goods so drafts and saving carry it along
  const gCfg = useMemo(() => goodsConfig(cfg), [cfg]);
  const [gEntry, setGEntry] = useState<Row>(() => blankRow(gCfg));
  const [gEditing, setGEditing] = useState<number | null>(null);
  const [gErrors, setGErrors] = useState<Record<string, string>>({});
  // sections that are open; only the first one at the start
  const [open, setOpen] = useState<Set<string>>(() => new Set(['main']));
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const dirty = useRef(false);
  const touch = () => { dirty.current = true; };

  /* ----- defaults that need browser data (branch, date, place of supply) ----- */
  useEffect(() => {
    if (!hydrated) return;
    if (!docDate) setDocDate(todayISO());
    // nothing is mandatory: the branch is picked for you (the one you work in, or the first one) and can be changed
    if (!branchId) setBranchId(isManager ? user?.branchId ?? '' : activeBranch !== 'all' ? activeBranch : branches[0]?.id ?? '');
    if (isNew && cfg.money && !cfg.freight && data.placeOfSupply === undefined && co.state) setData((p) => ({ ...p, placeOfSupply: co.state }));
    // new quotation / bill: the states start as the company's state
    if (isNew && cfg.freight && co.state) setData((p) => { const n = { ...p }; for (const k of ['fromState', 'toState', 'billState', 'consignorState', 'consigneeState']) if (n[k] === undefined) n[k] = co.state; return n; });
    const d = readDraft<Draft>(draftKey);
    if (d) setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /* ----- automatic document number (shown as a preview; the server assigns the real one when you save) ----- */
  const branch = branches.find((b) => b.id === branchId);
  const [auto, setAuto] = useState<string | null>(null);
  useEffect(() => {
    if (!isNew || numberTouched || !hydrated || !docDate || !branchId) { if (!branchId) setAuto(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api<{ number: string }>(`/api/docs/next-number?type=${cfg.slug}&branchId=${branchId}&date=${docDate}`)
        .then((r) => { if (live) { setAuto(r.number); setNumber(r.number); } })
        .catch(() => { if (live) setAuto(null); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [isNew, numberTouched, hydrated, docDate, branchId, cfg.slug]);

  /* ----- autosave the draft ----- */
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => writeDraft(draftKey, { number, numberTouched, docDate, branchId, status, data, items }), 500);
    return () => clearTimeout(t);
  }, [number, numberTouched, docDate, branchId, status, data, items, draftKey]);

  const restoreDraft = () => {
    if (!draft) return;
    setNumber(draft.number); setNumberTouched(draft.numberTouched); setDocDate(draft.docDate); setBranchId(draft.branchId);
    setStatus(draft.status); setData(draft.data); setItems((draft.items ?? []).filter((x) => rowTouched(cfg, x)));
    setEntry(blankRow(cfg)); setEditing(null); setEntryErrors({});
    dirty.current = true;
    setDraft(null);
  };
  const discardDraft = () => { clearDraft(draftKey); setDraft(null); };

  /* ----- helpers ----- */
  const setField = (k: string, v: string) => {
    touch();
    setData((p) => {
      let n = { ...p, [k]: v };
      if (cfg.derive && cfg.deriveOn?.includes(k)) n = { ...n, ...cfg.derive(n) };
      if (k === 'customerGst' && !validateValue('gstin', v)) { const s = stateFromGstin(normalize('gstin', v)); if (s) n.placeOfSupply = s; }
      return n;
    });
    setErrors((e) => { const c = { ...e }; delete c[k]; return c; });
  };

  const known = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const d of allDocs) {
      if (d.deletedAt) continue;
      const p = normalize('phone', d.data.customerPhone || '');
      if (p.length === 10 && d.data.customerName && !m.has(p)) m.set(p, d.data);
    }
    return m;
  }, [allDocs]);

  const bills: BillOpt[] = useMemo(() => {
    if (cfg.slug !== 'receipt') return [];
    const list = openBills(allDocs, co.state, initial?.id).map(({ bill, info }) => ({ bill, balance: info.calc.balance }));
    const sel = data.againstId ? allDocs.find((d) => d.id === data.againstId && d.type === 'bill') : undefined;
    if (sel && !list.some((x) => x.bill.id === sel.id)) list.push({ bill: sel, balance: billInfo(sel, allDocs, co.state, initial?.id).calc.balance });
    return list.map(({ bill, balance }) => ({
      id: bill.id, number: bill.number, name: bill.data.customerName || '', phone: bill.data.customerPhone || '', email: bill.data.customerEmail || '', balance,
      label: `${bill.number} · ${bill.data.customerName || ''} · due ${inr(balance)}`,
    }));
  }, [cfg.slug, allDocs, co.state, initial?.id, data.againstId]);

  const pickBill = (id: string) => {
    touch();
    const b = bills.find((x) => x.id === id);
    setData((p) => {
      const n = { ...p };
      if (!b) { delete n.againstId; delete n.againstDoc; return n; }
      n.againstId = b.id; n.againstDoc = b.number;
      n.customerName = b.name || n.customerName || '';
      n.customerPhone = b.phone || n.customerPhone || '';
      if (b.email && !n.customerEmail) n.customerEmail = b.email;
      n.amount = String(b.balance);
      n.purpose = `Payment against Bill / Invoice ${b.number}`;
      return n;
    });
    setErrors({});
  };

  /** Fills rate / unit / GST / SAC / volume from what you used before or the built-in presets. */
  const fillFromDescription = (r: Row, v: string): Row => {
    const n: Row = { ...r, description: v };
    const key = v.trim().toLowerCase();
    const memo = cfg.money ? getRates()[key] : undefined;
    const preset = cfg.suggest === 'services' ? SERVICE_PRESETS.find((s) => s.name.toLowerCase() === key) : undefined;
    const hh = cfg.suggest === 'household' && cfg.columns?.some((c) => c.key === 'cft') ? (HOUSEHOLD.find((h) => h.name.toLowerCase() === key) ?? (cftOf(v) ? { cft: cftOf(v)! } : undefined)) : undefined;
    if (memo?.rate && !(r.rate || '').trim()) n.rate = memo.rate;
    if (memo?.unit && (!r.unit || r.unit === 'Nos')) n.unit = memo.unit;
    if (memo?.gst !== undefined && !(r.gst || '').trim()) n.gst = memo.gst;
    if ((memo?.hsn || preset?.hsn) && !(r.hsn || '').trim()) n.hsn = memo?.hsn || preset?.hsn || '';
    if (hh && !(r.cft || '').trim()) n.cft = String(hh.cft);
    return n;
  };

  /* ----- items: entry boxes + list ----- */
  const setEntryCell = (k: string, v: string) => {
    touch();
    setEntry((r) => (k === 'description' ? fillFromDescription(r, v) : { ...r, [k]: v }));
    setEntryErrors((e) => { const c = { ...e }; delete c[k]; return c; });
  };
  /** The list as it will be saved: the boxes count too, so a typed item is never lost if Save is pressed before Add item. */
  const withEntry = (list: Row[]): Row[] => {
    if (editing !== null) return list.map((x, j) => (j === editing ? entry : x));
    return rowTouched(cfg, entry) ? [...list, entry] : list;
  };
  const addEntry = (): boolean => {
    if (editing === null && !rowTouched(cfg, entry)) { setEntryErrors({ [cfg.columns?.[0]?.key ?? 'description']: 'Type the item first' }); return false; }
    const errs = itemErrors(cfg, entry);
    if (Object.keys(errs).length) { setEntryErrors(errs); return false; }
    touch();
    setItems((p) => withEntry(p));
    setEntry(blankRow(cfg)); setEditing(null); setEntryErrors({});
    setErrors((e) => { const c: Record<string, string> = {}; for (const [k, v] of Object.entries(e)) if (!k.startsWith('item-') && k !== '_items') c[k] = v; return c; });
    return true;
  };
  const editItem = (i: number) => {
    if (editing === null && rowTouched(cfg, entry) && !window.confirm('The boxes have an item you have not added yet. Replace it with this item?')) return;
    setEntry({ ...blankRow(cfg), ...items[i] }); setEditing(i); setEntryErrors({});
    setTimeout(() => document.getElementById('items-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };
  const cancelEdit = () => { setEntry(blankRow(cfg)); setEditing(null); setEntryErrors({}); };
  const removeItem = (i: number) => {
    touch();
    setItems((p) => p.filter((_, j) => j !== i));
    if (editing === i) cancelEdit(); else if (editing !== null && editing > i) setEditing(editing - 1);
    setErrors((e) => { const c: Record<string, string> = {}; for (const [k, v] of Object.entries(e)) if (!k.startsWith('item-')) c[k] = v; return c; });
  };
  const pickChip = (name: string) => { touch(); setEntry((r) => fillFromDescription(isUntouched(cfg, r) ? blankRow(cfg) : r, name)); setEntryErrors({}); };

  /* ----- household items list ----- */
  const goods = useMemo(() => readGoods(data), [data.goods]); // eslint-disable-line react-hooks/exhaustive-deps
  const setGoods = (fn: (rows: Row[]) => Row[]) => { touch(); setData((p) => ({ ...p, [GOODS_KEY]: writeGoods(fn(readGoods(p))) })); };
  const gNamed = (x: Row) => !!((x.description || '').trim() || (x.remarks || '').trim());
  const gWithEntry = (list: Row[]) => (gEditing !== null ? (gNamed(gEntry) ? list.map((x, j) => (j === gEditing ? gEntry : x)) : list) : gNamed(gEntry) ? [...list, gEntry] : list);
  const gReset = () => { setGEntry(blankRow(gCfg)); setGEditing(null); setGErrors({}); };
  const gAdd = () => {
    if (!gNamed(gEntry)) { setGErrors({ description: 'Type the item name' }); return; }
    setGoods((p) => gWithEntry(p)); gReset();
  };

  /* ----- live totals ----- */
  const shownItems = cfg.columns ? withEntry(items) : items;
  const live: DocRecord = { id: initial?.id ?? 'draft', type: cfg.slug, number, status, docDate, createdAt: '', updatedAt: '', data, items: shownItems };
  const liveCalc = useMemo(() => docCalc(live, cfg, allDocs, co.state), [data, items, entry, editing, cfg, allDocs, co.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = cfg.money ? moneyCalc({ data, items: shownItems.filter((r) => (r.description || '').trim()) }, { home: co.state, advanceMode: cfg.advance ?? 'required' }) : null;

  const selectedBillBalance = cfg.slug === 'receipt' && data.againstId
    ? (() => { const b = allDocs.find((d) => d.id === data.againstId); return b ? billInfo(b, allDocs, co.state, initial?.id).calc.balance : null; })()
    : null;

  /** Opens every section that has a problem, so the red message is never hidden in a closed section. */
  const openFor = (errs: Record<string, string>) => {
    const ids = new Set<string>();
    for (const k of Object.keys(errs)) {
      if (k.startsWith('item-') || k === '_items') { ids.add('items'); continue; }
      if (k === 'discount' || k === 'advance') { ids.add('charges'); continue; }
      const i = cfg.sections.findIndex((sec) => sec.fields.some((f) => f.key === k));
      ids.add(i > 0 ? 'sec-' + i : 'main');
    }
    setOpen((o) => new Set([...o, ...ids]));
  };

  /* ----- save ----- */
  const submit = async () => {
    if (saving) return;
    setFormError('');
    // an item still in the boxes is added (or updated) first
    let list = items;
    if (cfg.columns && (editing !== null || rowTouched(cfg, entry))) {
      const ie = itemErrors(cfg, entry);
      if (Object.keys(ie).length) {
        setEntryErrors(ie);
        setFormError('Finish the item in the boxes (or clear them), then save.');
        setTimeout(() => document.getElementById('items-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return;
      }
      list = withEntry(items);
      setItems(list); setEntry(blankRow(cfg)); setEditing(null); setEntryErrors({});
    }
    // an item typed in the Items list boxes is added too
    let goodsText = data[GOODS_KEY] ?? '';
    if (cfg.goods && gNamed(gEntry)) { goodsText = writeGoods(gWithEntry(goods)); setData((p) => ({ ...p, [GOODS_KEY]: goodsText })); gReset(); }
    const date = docDate || todayISO();
    if (!docDate) setDocDate(date);
    const errs = validateDoc(cfg, data, list, { docDate: date, number: number || 'AUTO', docs: allDocs, selfId: initial?.id, home: co.state, billBalance: selectedBillBalance, receivedBefore: cfg.slug === 'bill' && initial ? round2(receiptsFor(initial, allDocs).reduce((a, r) => a + num(r.data.amount), 0)) : 0 });
    if (!branchId) errs.branchId = 'Choose a branch';
    if (Object.keys(errs).length) {
      setErrors(errs);
      openFor(errs);
      setTimeout(() => (document.querySelector('[data-err="1"]') ?? document.getElementById('items-card'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
      return;
    }
    const cleaned = cleanData(cfg, data);
    if (cfg.goods && goodsText) cleaned[GOODS_KEY] = goodsText; else delete cleaned[GOODS_KEY];
    const termsText = (data.terms ?? defaultTerms).trim();
    if (data.terms !== undefined && termsText !== defaultTerms.trim()) cleaned.terms = termsText; else delete cleaned.terms;
    const rows = cfg.columns ? list.filter((r) => !isUntouched(cfg, r)).map((r) => ({ ...r, ...(r.description ? { description: r.description.trim() } : {}) })) : [];

    if (isNew) {
      const phone = cleaned.customerPhone;
      const probe: DocRecord = { id: 'probe', type: cfg.slug, number: '', status, docDate, createdAt: '', updatedAt: '', data: cleaned, items: rows };
      const total = docCalc(probe, cfg, allDocs, co.state).total;
      const dup = allDocs.find((d) => d.type === cfg.slug && phone && d.data.customerPhone === phone && d.docDate === docDate && Math.abs(docCalc(d, cfg, allDocs, companyFor(d.branchId).state).total - total) < 0.005);
      if (dup && !window.confirm(`This looks like a duplicate of ${dup.number} (same customer, date and amount). Save anyway?`)) return;
    }
    const manual = numberTouched ? number.trim() : '';
    const payload = { type: cfg.slug, branchId, ...(manual && (isNew || manual !== initial?.number) ? { number: manual } : {}), status: cfg.slug === 'bill' ? initial?.status ?? 'Unpaid' : status, docDate: date, data: cleaned, items: rows, ...(initial ? { rev: initial.rev } : {}), ...(isNew && linkedLead ? { leadId: linkedLead } : {}) };
    setSaving(true);
    try {
      if (cfg.money) rememberRates(rows);
      const saved = initial ? await updateDoc(initial.id, payload) : await createDoc(payload);
      clearDraft(draftKey);
      dirty.current = false;
      if (isNew && linkedLead) leadsChanged();
      router.replace(`/docs/${cfg.slug}/view?id=${saved.id}`);
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiFail) {
        if (e.fields) { setErrors(e.fields); openFor(e.fields); setTimeout(() => document.querySelector('[data-err="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
        setFormError(e.status === 409 && e.code === 'conflict' ? e.message + ' (Go back and open it again.)' : e.message);
      } else setFormError('Could not save. Please try again.');
    }
  };

  /** Copies a saved customer's details into the empty boxes of this form (never over what was typed). */
  const pickCustomer = (p: Picked) => {
    touch();
    setData((cur) => {
      const n = { ...cur };
      for (const [k, v] of Object.entries(p.data)) {
        if (!v || !fieldKeys.has(k)) continue;
        const now = (n[k] ?? '').trim();
        if (!now || now === (cfg.defaults?.[k] ?? '')) n[k] = v;
      }
      return n;
    });
    if (p.leadId) setLinkedLead(p.leadId);
    if (p.branchId && !isManager && branches.some((b) => b.id === p.branchId)) setBranchId(p.branchId);
  };

  const listId = cfg.suggest ? 'suggest-' + cfg.suggest : undefined;
  const chips = cfg.suggest ? suggestionNames(cfg.suggest).filter((n) => !shownItems.some((r) => (r.description || '').toLowerCase() === n.toLowerCase())).slice(0, cfg.suggest === 'services' ? 6 : 8) : [];
  const autoNote = m && !m.igst && !data.placeOfSupply ? 'Place of supply is empty, so CGST + SGST is used.' : '';

  /* ----- one field (customer match button, GSTIN state, hints) ----- */
  const fieldCell = (f: Field) => {
    const phone = f.key === 'customerPhone' ? normalize('phone', data.customerPhone || '') : '';
    const match = phone.length === 10 ? known.get(phone) : undefined;
    const showMatch = match && (match.customerName !== (data.customerName || '') || !(data.customerName || '').trim());
    const span = f.type === 'textarea' || f.type === 'check' ? 'col-span-2 lg:col-span-4' : f.half ? 'col-span-1' : 'col-span-2';
    return (
      <div key={f.key} className={span}>
        {f.type !== 'check' && <FieldLabel text={f.label} required={f.required} htmlFor={'f-' + f.key} />}
        <Suggest f={f} />
        <FieldInput f={f} value={data[f.key] ?? ''} error={errors[f.key]} bills={bills} onChange={(v) => setField(f.key, v)} onBill={pickBill} />
        <Err msg={errors[f.key]} />
        {!errors[f.key] && f.hint && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
        {f.key === 'customerGst' && data.customerGst && !validateValue('gstin', data.customerGst) && stateFromGstin(normalize('gstin', data.customerGst)) && <p className="mt-1 text-xs text-emerald-700">State: {stateFromGstin(normalize('gstin', data.customerGst))}</p>}
        {showMatch && match && (
          <button type="button" className="mt-2 w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-left text-xs text-brand-800" onClick={() => {
            touch();
            setData((p) => ({ ...p, customerName: match.customerName, ...(match.customerEmail && !p.customerEmail ? { customerEmail: match.customerEmail } : {}), ...(cfg.money && match.customerGst && !p.customerGst ? { customerGst: match.customerGst } : {}), ...(cfg.money && match.billingAddress && !p.billingAddress ? { billingAddress: match.billingAddress } : {}) }));
          }}>
            Saved customer: <b>{match.customerName}</b>. Tap to fill the details.
          </button>
        )}
      </div>
    );
  };
  // counts only what was typed, not the starting values (India, Ground Floor, Included in Freight…)
  const filledIn = (fields: Field[]) => fields.filter((f) => {
    const v = (data[f.key] ?? '').trim();
    return v && v !== (cfg.defaults?.[f.key] ?? '') && !(f.key.endsWith('State') && v === co.state) && !(f.key === 'placeOfSupply' && v === co.state);
  }).length;
  const hasErr = (keys: (k: string) => boolean) => Object.keys(errors).some((k) => errors[k] && keys(k));

  /** A section that opens and closes when its title is tapped (only the first one starts open). */
  const fold = (id: string, title: string, badge: string, errKeys: (k: string) => boolean, children: React.ReactNode, cardId?: string) => {
    const isOpen = open.has(id);
    const bad = hasErr(errKeys);
    return (
      <section id={cardId} className={`card ${bad ? 'ring-2 ring-red-200' : ''}`}>
        <button type="button" onClick={() => toggle(id)} aria-expanded={isOpen}
          className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${isOpen ? 'rounded-t-2xl border-b border-slate-200 bg-slate-50' : 'rounded-2xl hover:bg-slate-50'}`}>
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: cfg.color }} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block font-semibold text-slate-900">{title}</span>
            <Hi t={title} className="block text-xs text-slate-500" />
          </span>
          {bad && <AlertCircle size={18} className="shrink-0 text-red-500" />}
          {badge && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">{badge}</span>}
          <ChevronDown size={20} className={`shrink-0 text-slate-500 transition ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="space-y-3 p-4">{children}</div>}
      </section>
    );
  };

  const first = cfg.sections[0];
  const firstFields = first ? first.fields.filter((f) => isVisible(f, data)) : [];
  const mainKeys = new Set(['number', 'docDate', 'branchId', ...(first?.fields.map((f) => f.key) ?? [])]);
  const goodsChips = HOUSEHOLD.map((h) => h.name).filter((n) => !goods.some((x) => (x.description || '').toLowerCase() === n.toLowerCase())).slice(0, 10);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200" aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="min-w-0 text-xl font-bold leading-tight" style={{ color: cfg.color }}>{initial ? 'Edit' : 'New'} {cfg.title} <Hi t={cfg.title} className="block text-sm text-slate-500" /></h1>
      </div>

      {formError && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{formError}</div>}

      {draft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="flex-1 text-amber-900">You have an unsaved draft of this form.</span>
          <button className="btn-primary min-h-[38px]" onClick={restoreDraft}>Restore</button>
          <button className="btn-ghost min-h-[38px]" onClick={discardDraft}>Discard</button>
        </div>
      )}

      {legacyNote && (
        <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This {cfg.title.toLowerCase()} was made with the old charges list. Its amount has been moved into <b>Freight charge</b> (Payment details) and the old lines are in the remark. Check the totals, then save.
        </div>
      )}
      {isNew && fieldKeys.has('customerName') && <CustomerPicker leads={leads} docs={allDocs} onPick={pickCustomer} />}
      {linkedLead && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900">
          <span className="flex-1">For saved customer <b className="uppercase">{linkedName || 'from your leads'}</b>. {cfg.slug === 'bill' ? 'It is marked Converted when you save.' : cfg.slug === 'quotation' ? 'It is marked Quotation sent when you save.' : 'This document is added to the customer.'}</span>
          <button type="button" className="font-semibold underline" onClick={() => setLinkedLead('')}>Unlink</button>
        </div>
      )}
      <p className="mb-3 px-1 text-xs text-slate-500">Tap a section to open it. Nothing is compulsory: fill what you know. <span lang="hi">· जो पता है वही भरें, कुछ भी ज़रूरी नहीं।</span></p>

      <div className="space-y-3">
        {/* 1. main details: number, date, branch, status and the first section (customer) */}
        {fold('main', 'Main details', '', (k) => mainKeys.has(k), (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2">
              <FieldLabel text="Number" htmlFor="f-number" />
              <input id="f-number" data-err={errors.number ? '1' : undefined} className={`input ${errors.number ? 'border-red-400 ring-2 ring-red-100' : ''}`} value={number} maxLength={60} onChange={(e) => { setNumber(e.target.value); setNumberTouched(true); touch(); setErrors((x) => ({ ...x, number: '' })); }} />
              <Err msg={errors.number} />
              {isNew && numberTouched && auto && <button type="button" className="mt-1 text-xs font-medium text-brand-700" onClick={() => { setNumberTouched(false); setNumber(auto); }}>Use automatic number ({auto})</button>}
              {isNew && !numberTouched && <p className="mt-1 text-xs text-slate-400">{auto ? 'Automatic. The final number is given when you save.' : branchId ? 'Working out the number…' : 'Choose a branch to see the number.'}</p>}
            </div>
            <div className="col-span-1"><FieldLabel text="Date" htmlFor="f-docDate" /><input id="f-docDate" type="date" className="input" value={docDate} onChange={(e) => { setDocDate(e.target.value); touch(); }} /><Err msg={errors.docDate} /></div>
            <div className="col-span-1"><FieldLabel text="Branch" htmlFor="f-branchId" />
              {isManager || initial ? (
                <p className="input flex items-center bg-slate-50 text-slate-600">{branches.find((b) => b.id === branchId)?.name ?? '-'}</p>
              ) : (
                <select id="f-branchId" data-err={errors.branchId ? '1' : undefined} className={`input ${errors.branchId ? 'border-red-400 ring-2 ring-red-100' : ''}`} value={branchId} onChange={(e) => { setBranchId(e.target.value); touch(); setErrors((x) => ({ ...x, branchId: '' })); }}>
                  {!branchId && <option value="">Choose branch</option>}
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <Err msg={errors.branchId} /></div>
            {/* status is changed later, from the list or when editing; a new document starts with the first status */}
            {initial && cfg.slug !== 'bill' && (
              <div className="col-span-2"><FieldLabel text="Status" htmlFor="f-status" />
                <select id="f-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); touch(); }}>{cfg.statuses.map((x) => <option key={x}>{x}</option>)}</select></div>
            )}
            {first && firstFields.length > 0 && (
              <>
                <p className="col-span-2 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-800 lg:col-span-4">{first.title} <Hi t={first.title} className="text-xs text-slate-500" /></p>
                {firstFields.map(fieldCell)}
              </>
            )}
          </div>
        ))}

        {/* 2. the other sections, closed until tapped */}
        {cfg.sections.slice(1).map((sec, i) => {
          const fields = sec.fields.filter((f) => isVisible(f, data));
          if (!fields.length) return null;
          const n = filledIn(fields);
          const keys = new Set(sec.fields.map((f) => f.key));
          return (
            <div key={sec.title}>
              {fold('sec-' + (i + 1), sec.title, n ? `${n} filled` : '', (k) => keys.has(k), <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{fields.map(fieldCell)}</div>)}
            </div>
          );
        })}

        {/* 3. household items list (quotation / bill), before the priced services */}
        {cfg.goods && fold('goods', 'Items list', goods.length ? `${goods.length} items` : '', () => false, (
          <>
            <p className="text-xs text-slate-500">Household goods to shift (bed, TV, fridge…). Printed on the PDF as a list, without prices.</p>
            <datalist id="suggest-household">{suggestionNames('household').map((x) => <option key={x} value={x} />)}</datalist>
            <ItemsEditor
              idPrefix="goods-" cfg={gCfg} items={goods} entry={gEntry} editing={gEditing} entryErrors={gErrors} errors={{}} listId="suggest-household" chips={gEditing === null ? goodsChips : []}
              onEntry={(k, v) => { touch(); setGEntry((x) => ({ ...x, [k]: v })); setGErrors({}); }}
              onAdd={gAdd}
              onEdit={(i) => { setGEntry({ ...blankRow(gCfg), ...goods[i] }); setGEditing(i); setGErrors({}); }}
              onCancelEdit={gReset}
              onRemove={(i) => { setGoods((p) => p.filter((_, j) => j !== i)); if (gEditing === i) gReset(); else if (gEditing !== null && gEditing > i) setGEditing(gEditing - 1); }}
              onChip={(name) => { setGEntry((x) => ({ ...x, description: name })); setGErrors({}); }}
            />
          </>
        ))}

        {/* 4. priced services / items */}
        {cfg.columns && fold('items', cfg.itemsTitle ?? 'Items', items.length ? `${items.length} added` : '', (k) => k.startsWith('item-') || k === '_items', (
          <>
            <Err msg={errors._items} />
            {listId && <datalist id={listId}>{suggestionNames(cfg.suggest!).map((x) => <option key={x} value={x} />)}</datalist>}
            <ItemsEditor
              cfg={cfg} items={items} entry={entry} editing={editing} entryErrors={entryErrors} errors={errors} listId={listId} chips={chips}
              onEntry={setEntryCell} onAdd={addEntry} onEdit={editItem} onCancelEdit={cancelEdit} onRemove={removeItem} onChip={pickChip}
            />
          </>
        ), 'items-card')}

        {/* 5. discount, GST, advance */}
        {m && !cfg.freight && fold('charges', 'Charges & tax', data.discount || data.advance ? 'filled' : '', (k) => k === 'discount' || k === 'advance', (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <FieldLabel text="Discount" htmlFor="f-discount" />
                <div className="flex gap-2">
                  <select aria-label="Discount type" className="input !w-16 shrink-0 px-2" value={data.discountType ?? '₹'} onChange={(e) => setField('discountType', e.target.value)}><option>₹</option><option>%</option></select>
                  <input id="f-discount" data-err={errors.discount ? '1' : undefined} className={`input min-w-0 ${errors.discount ? 'border-red-400' : ''}`} type="number" inputMode="decimal" min={0} value={data.discount ?? ''} onChange={(e) => setField('discount', e.target.value)} />
                </div>
                <Err msg={errors.discount} />
              </div>
              <div><FieldLabel text="Default GST" htmlFor="f-gstRate" />
                <select id="f-gstRate" className="input" value={data.gstRate ?? '0'} onChange={(e) => setField('gstRate', e.target.value)}>
                  {GST_RATES.map((g) => <option key={g} value={g}>{g === '0' ? 'No GST' : g + '%'}</option>)}
                </select></div>
              <div><FieldLabel text="GST type" htmlFor="f-gstMode" />
                <select id="f-gstMode" className="input" value={data.gstMode ?? 'Auto'} onChange={(e) => setField('gstMode', e.target.value)}>
                  <option value="Auto">Auto (by state)</option><option>CGST + SGST</option><option>IGST</option>
                </select></div>
              <div><FieldLabel text={cfg.advanceLabel ?? 'Advance (₹)'} htmlFor="f-advance" />
                <input id="f-advance" data-err={errors.advance ? '1' : undefined} className={`input ${errors.advance ? 'border-red-400' : ''}`} type="number" inputMode="decimal" min={0} value={data.advance ?? ''} onChange={(e) => setField('advance', e.target.value)} />
                <Err msg={errors.advance} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-5 w-5 rounded" checked={data.roundOff === '1'} onChange={(e) => setField('roundOff', e.target.checked ? '1' : '0')} />Round off the total to the nearest rupee
            </label>
            {m.gst > 0 && <p className="text-xs text-slate-500">Tax is charged as <b>{m.igst ? 'IGST' : 'CGST + SGST'}</b>{data.placeOfSupply ? ` for ${data.placeOfSupply}` : ''}. {autoNote}</p>}
          </>
        ))}

        {/* 6. terms */}
        {cfg.terms.length > 0 && fold('terms', 'Terms & conditions', data.terms !== undefined ? 'changed' : '', () => false, (
          <>
            <p className="text-xs text-slate-500">One term per line. Changes here apply to this document only. Change the standard text in Settings.</p>
            <AutoTextarea className="input text-sm leading-relaxed" minRows={5} maxLength={20000} value={data.terms ?? defaultTerms} onChange={(e) => setField('terms', e.target.value)} />
          </>
        ))}

        {/* total is always visible */}
        {liveCalc.lines.length > 0 && (
          <section className="card p-4" data-err={errors._total ? '1' : undefined}>
            <h2 className="mb-2 font-semibold text-slate-900">Summary <Hi t="Summary" className="text-sm text-slate-500" /></h2>
            {errors._total && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">{errors._total}</p>}
            <dl className="space-y-1.5 rounded-xl bg-brand-50 p-3 text-sm">
              {(m ? moneyLines(m) : liveCalc.lines).map((ln, i) => (
                <div key={i} className={`flex justify-between gap-3 ${ln.bold ? 'border-t border-brand-200 pt-1.5 text-base font-bold text-brand-800' : ''}`}>
                  <dt>{ln.label}</dt><dd className="whitespace-nowrap">{ln.text ?? `${ln.value < 0 ? '- ' : ''}${inr(Math.abs(ln.value))}`}</dd>
                </div>
              ))}
            </dl>
            {liveCalc.total > 0 && <p className="mt-2 text-xs text-slate-500">{amountInWords(liveCalc.total)}</p>}
          </section>
        )}
        {!liveCalc.lines.length && liveCalc.total > 0 && <p className="px-1 text-sm text-slate-600">Amount in words: <b>{amountInWords(liveCalc.total)}</b></p>}
      </div>

      {/* Save / Cancel at the end of the form (the app's bottom menu stays visible on phones) */}
      {formError && <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{formError}</div>}
      <div className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:justify-end">
        <button onClick={() => router.back()} className="btn-ghost flex-1 flex-col gap-0 leading-tight lg:flex-none lg:px-8">Cancel <Hi t="Cancel" className="text-[11px] text-slate-500" /></button>
        <button onClick={submit} disabled={saving} className="btn-primary flex-[2] lg:flex-none lg:px-10"><span className="flex flex-col leading-tight"><span>{saving ? 'Saving…' : initial ? 'Save changes' : `Save ${cfg.title}`}</span><Hi t="Save" className="text-[11px] text-white/90" /></span></button>
      </div>
    </div>
  );
}
