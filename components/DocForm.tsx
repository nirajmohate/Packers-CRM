'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ItemsEditor from './ItemsEditor';
import { AutoTextarea, FieldLabel, Hi } from './ui';
import type { DocRecord, Field, ModuleConfig, Row } from '@/lib/types';
import { GST_RATES, HOUSEHOLD, SERVICE_PRESETS, suggestionNames } from '@/lib/config';
import { ApiFail, clearDraft, createDoc, getRates, readDraft, rememberRates, updateDoc, useActiveBranch, useActiveBranches, useAllDocs, useCompanyFor, useHydrated, useSession, useTermsFor, writeDraft } from '@/lib/store';
import { api } from '@/lib/api';
import { docCalc, billInfo, openBills, receiptsFor } from '@/lib/ledger';
import { moneyCalc, moneyLines, num, round2 } from '@/lib/calc';
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
  if (f.type === 'textarea') return <AutoTextarea {...common} minRows={f.rows ?? 2} className={cls} value={value} placeholder={f.placeholder} maxLength={f.key === 'body' ? 20000 : 2000} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'select')
    return (
      <select {...common} className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {f.options?.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  return (
    <input
      {...common} className={cls} value={value} placeholder={f.placeholder} readOnly={f.readOnly}
      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'tel' ? 'tel' : 'text'}
      inputMode={f.type === 'number' ? 'decimal' : f.type === 'tel' ? 'tel' : f.validate === 'email' ? 'email' : undefined}
      autoCapitalize={f.upper ? 'characters' : undefined}
      step={f.type === 'number' ? 'any' : undefined} min={f.type === 'number' ? f.min : undefined} max={f.type === 'number' ? f.max : undefined}
      onChange={(e) => onChange(f.upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}

export default function DocForm({ cfg, initial, prefill, draftKey }: { cfg: ModuleConfig; initial?: DocRecord; prefill?: { data: Record<string, string>; items: Row[] }; draftKey: string }) {
  const router = useRouter();
  const allDocs = useAllDocs();
  const user = useSession();
  const isManager = user?.role === 'manager';
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
  const [branchId, setBranchId] = useState(initial?.branchId ?? (isManager ? user?.branchId ?? '' : ''));
  const co = companyFor(branchId || null);
  const defaultTerms = termsFor(cfg.slug, branchId || null, cfg.terms).join('\n');
  const [status, setStatus] = useState(initial?.status ?? cfg.statuses[0]);
  const [data, setData] = useState<Record<string, string>>(initial?.data ?? { gstRate: '0', gstMode: 'Auto', roundOff: '1', discountType: '₹', ...(prefill?.data ?? {}) });
  const [items, setItems] = useState<Row[]>(() => (initial?.items?.length ? initial.items : prefill?.items ?? []).filter((x) => rowTouched(cfg, x)));
  // the "new item" boxes above the list; `editing` is the list position being changed, or null for a new item
  const [entry, setEntry] = useState<Row>(() => blankRow(cfg));
  const [editing, setEditing] = useState<number | null>(null);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const dirty = useRef(false);
  const touch = () => { dirty.current = true; };

  /* ----- defaults that need browser data (branch, date, place of supply) ----- */
  useEffect(() => {
    if (!hydrated) return;
    if (!docDate) setDocDate(todayISO());
    if (!branchId) setBranchId(isManager ? user?.branchId ?? '' : activeBranch !== 'all' ? activeBranch : '');
    if (isNew && cfg.money && data.placeOfSupply === undefined && co.state) setData((p) => ({ ...p, placeOfSupply: co.state }));
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
    const hh = cfg.suggest === 'household' && cfg.columns?.some((c) => c.key === 'cft') ? HOUSEHOLD.find((h) => h.name.toLowerCase() === key) : undefined;
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

  /* ----- live totals ----- */
  const shownItems = cfg.columns ? withEntry(items) : items;
  const live: DocRecord = { id: initial?.id ?? 'draft', type: cfg.slug, number, status, docDate, createdAt: '', updatedAt: '', data, items: shownItems };
  const liveCalc = useMemo(() => docCalc(live, cfg, allDocs, co.state), [data, items, entry, editing, cfg, allDocs, co.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = cfg.money ? moneyCalc({ data, items: shownItems.filter((r) => (r.description || '').trim()) }, { home: co.state, advanceMode: cfg.advance ?? 'required' }) : null;

  const selectedBillBalance = cfg.slug === 'receipt' && data.againstId
    ? (() => { const b = allDocs.find((d) => d.id === data.againstId); return b ? billInfo(b, allDocs, co.state, initial?.id).calc.balance : null; })()
    : null;

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
    const errs = validateDoc(cfg, data, list, { docDate, number: number || 'AUTO', docs: allDocs, selfId: initial?.id, home: co.state, billBalance: selectedBillBalance, receivedBefore: cfg.slug === 'bill' && initial ? round2(receiptsFor(initial, allDocs).reduce((a, r) => a + num(r.data.amount), 0)) : 0 });
    if (!branchId) errs.branchId = 'Choose a branch';
    if (Object.keys(errs).length) {
      setErrors(errs);
      setTimeout(() => (document.querySelector('[data-err="1"]') ?? document.getElementById('items-card'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      return;
    }
    const cleaned = cleanData(cfg, data);
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
    const payload = { type: cfg.slug, branchId, ...(manual && (isNew || manual !== initial?.number) ? { number: manual } : {}), status: cfg.slug === 'bill' ? initial?.status ?? 'Unpaid' : status, docDate, data: cleaned, items: rows, ...(initial ? { rev: initial.rev } : {}) };
    setSaving(true);
    try {
      if (cfg.money) rememberRates(rows);
      const saved = initial ? await updateDoc(initial.id, payload) : await createDoc(payload);
      clearDraft(draftKey);
      dirty.current = false;
      router.replace(`/docs/${cfg.slug}/view?id=${saved.id}`);
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiFail) {
        if (e.fields) { setErrors(e.fields); setTimeout(() => document.querySelector('[data-err="1"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }
        setFormError(e.status === 409 && e.code === 'conflict' ? e.message + ' (Go back and open it again.)' : e.message);
      } else setFormError('Could not save. Please try again.');
    }
  };

  const listId = cfg.suggest ? 'suggest-' + cfg.suggest : undefined;
  const chips = cfg.suggest ? suggestionNames(cfg.suggest).filter((n) => !shownItems.some((r) => (r.description || '').toLowerCase() === n.toLowerCase())).slice(0, cfg.suggest === 'services' ? 6 : 8) : [];
  const autoNote = m && !m.igst && !data.placeOfSupply ? 'Place of supply is empty, so CGST + SGST is used.' : '';

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200" aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold" style={{ color: cfg.color }}>{initial ? 'Edit' : 'New'} {cfg.title} <Hi t={cfg.title} className="text-base text-slate-500" /></h1>
      </div>

      {formError && <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{formError}</div>}

      {draft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="flex-1 text-amber-900">You have an unsaved draft of this form.</span>
          <button className="btn-primary min-h-[38px]" onClick={restoreDraft}>Restore</button>
          <button className="btn-ghost min-h-[38px]" onClick={discardDraft}>Discard</button>
        </div>
      )}

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 [&>*]:lg:self-start">
        <section className="card space-y-3 p-4">
          <h2 className="section-title" style={{ borderColor: cfg.color }}>Document <Hi t="Document" className="text-sm text-slate-500" /></h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label" htmlFor="f-number">Number</label>
              <input id="f-number" data-err={errors.number ? '1' : undefined} className={`input ${errors.number ? 'border-red-400 ring-2 ring-red-100' : ''}`} value={number} onChange={(e) => { setNumber(e.target.value); setNumberTouched(true); touch(); setErrors((x) => ({ ...x, number: '' })); }} />
              <Err msg={errors.number} />
              {isNew && numberTouched && auto && <button type="button" className="mt-1 text-xs font-medium text-brand-700" onClick={() => { setNumberTouched(false); setNumber(auto); }}>Use automatic number ({auto})</button>}
              {isNew && !numberTouched && <p className="mt-1 text-xs text-slate-400">{auto ? 'Preview. The final number is assigned when you save.' : branchId ? 'Working out the number…' : 'Choose a branch to see the number.'}</p>}
            </div>
            <div><label className="label" htmlFor="f-docDate">Date</label><input id="f-docDate" type="date" className="input" value={docDate} onChange={(e) => { setDocDate(e.target.value); touch(); }} /><Err msg={errors.docDate} /></div>
            <div><label className="label">Branch</label>
              {isManager || initial ? (
                <p className="input flex items-center bg-slate-50 text-slate-600">{branches.find((b) => b.id === branchId)?.name ?? '-'}</p>
              ) : (
                <select id="f-branchId" data-err={errors.branchId ? '1' : undefined} className={`input ${errors.branchId ? 'border-red-400 ring-2 ring-red-100' : ''}`} value={branchId} onChange={(e) => { setBranchId(e.target.value); touch(); setErrors((x) => ({ ...x, branchId: '' })); }}>
                  <option value="">Choose branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              <Err msg={errors.branchId} /></div>
            {cfg.slug !== 'bill' && (
              <div className="col-span-2"><label className="label">Status</label>
                <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); touch(); }}>{cfg.statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
            )}
          </div>
        </section>

        {cfg.sections.map((s) => {
          const fields = s.fields.filter((f) => isVisible(f, data));
          if (!fields.length) return null;
          return (
            <section key={s.title} className="card space-y-3 p-4">
              <h2 className="section-title" style={{ borderColor: cfg.color }}>{s.title} <Hi t={s.title} className="text-sm text-slate-500" /></h2>
              <div className="grid grid-cols-2 gap-3">
                {fields.map((f) => {
                  const phone = f.key === 'customerPhone' ? normalize('phone', data.customerPhone || '') : '';
                  const match = phone.length === 10 ? known.get(phone) : undefined;
                  const showMatch = match && (match.customerName !== (data.customerName || '') || !(data.customerName || '').trim());
                  return (
                    <div key={f.key} className={f.half ? '' : 'col-span-2'}>
                      <FieldLabel text={f.label} required={f.required} htmlFor={'f-' + f.key} />
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
                })}
              </div>
            </section>
          );
        })}

        {cfg.columns && (
          <section id="items-card" className="card space-y-3 p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{cfg.itemsTitle ?? 'Items'} <Hi t={cfg.itemsTitle ?? 'Items'} className="text-sm text-slate-500" /></h2>
              {cfg.itemsRequired && <span className="text-xs text-slate-400">At least one item</span>}
            </div>
            <Err msg={errors._items} />
            {listId && <datalist id={listId}>{suggestionNames(cfg.suggest!).map((x) => <option key={x} value={x} />)}</datalist>}
            <ItemsEditor
              cfg={cfg} items={items} entry={entry} editing={editing} entryErrors={entryErrors} errors={errors} listId={listId} chips={chips}
              onEntry={setEntryCell} onAdd={addEntry} onEdit={editItem} onCancelEdit={cancelEdit} onRemove={removeItem} onChip={pickChip}
            />
          </section>
        )}

        {m && (
          <section className="card space-y-3 p-4 lg:col-span-2">
            <h2 className="section-title" style={{ borderColor: cfg.color }}>Charges &amp; tax <Hi t="Charges & tax" className="text-sm text-slate-500" /></h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <label className="label">Discount</label>
                <div className="flex gap-2">
                  <select className="input !w-20 shrink-0 px-2" value={data.discountType ?? '₹'} onChange={(e) => setField('discountType', e.target.value)}><option>₹</option><option>%</option></select>
                  <input id="f-discount" data-err={errors.discount ? '1' : undefined} className={`input ${errors.discount ? 'border-red-400' : ''}`} type="number" inputMode="decimal" min={0} value={data.discount ?? ''} onChange={(e) => setField('discount', e.target.value)} />
                </div>
                <Err msg={errors.discount} />
              </div>
              <div><label className="label">Default GST</label>
                <select className="input" value={data.gstRate ?? '0'} onChange={(e) => setField('gstRate', e.target.value)}>
                  {GST_RATES.map((g) => <option key={g} value={g}>{g === '0' ? 'No GST' : g + '%'}</option>)}
                </select></div>
              <div><label className="label">GST type</label>
                <select className="input" value={data.gstMode ?? 'Auto'} onChange={(e) => setField('gstMode', e.target.value)}>
                  <option value="Auto">Auto (by state)</option><option>CGST + SGST</option><option>IGST</option>
                </select></div>
              <div><label className="label">{cfg.advanceLabel ?? 'Advance (₹)'}</label>
                <input id="f-advance" data-err={errors.advance ? '1' : undefined} className={`input ${errors.advance ? 'border-red-400' : ''}`} type="number" inputMode="decimal" min={0} value={data.advance ?? ''} onChange={(e) => setField('advance', e.target.value)} />
                <Err msg={errors.advance} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-5 w-5 rounded" checked={data.roundOff === '1'} onChange={(e) => setField('roundOff', e.target.checked ? '1' : '0')} />Round off the total to the nearest rupee
            </label>
            {m.gst > 0 && <p className="text-xs text-slate-500">Tax is charged as <b>{m.igst ? 'IGST' : 'CGST + SGST'}</b>{data.placeOfSupply ? ` for ${data.placeOfSupply}` : ''}. {autoNote}</p>}
          </section>
        )}

        {liveCalc.lines.length > 0 && (
          <section className="card p-4 lg:col-span-2" data-err={errors._total ? '1' : undefined}>
            <h2 className="mb-2 font-semibold text-slate-900">Summary <Hi t="Summary" className="text-sm text-slate-500" /></h2>
            {errors._total && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">{errors._total}</p>}
            <dl className="space-y-1.5 rounded-xl bg-brand-50 p-3 text-sm">
              {(m ? moneyLines(m) : liveCalc.lines).map((ln, i) => (
                <div key={i} className={`flex justify-between ${ln.bold ? 'border-t border-brand-200 pt-1.5 text-base font-bold text-brand-800' : ''}`}>
                  <dt>{ln.label}</dt><dd>{ln.value < 0 ? '- ' : ''}{inr(Math.abs(ln.value))}</dd>
                </div>
              ))}
            </dl>
            {liveCalc.total > 0 && <p className="mt-2 text-xs text-slate-500">{amountInWords(liveCalc.total)}</p>}
          </section>
        )}
        {!liveCalc.lines.length && liveCalc.total > 0 && <p className="px-1 text-sm text-slate-600 lg:col-span-2">Amount in words: <b>{amountInWords(liveCalc.total)}</b></p>}

        {cfg.terms.length > 0 && (
          <section className="card space-y-2 p-4 lg:col-span-2">
            <h2 className="font-semibold text-slate-900">Terms &amp; conditions <Hi t="Terms & conditions" className="text-sm text-slate-500" /></h2>
            <p className="text-xs text-slate-500">One term per line. Changes here apply to this document only. Change the standard text in Settings.</p>
            <AutoTextarea className="input text-sm leading-relaxed" minRows={5} maxLength={20000} value={data.terms ?? defaultTerms} onChange={(e) => setField('terms', e.target.value)} />
          </section>
        )}
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
