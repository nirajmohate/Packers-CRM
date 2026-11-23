import type { DocRecord, ModuleConfig, Row } from './types';
import { moneyCalc, num } from './calc';
import { isVisible } from './fields';
import { inr } from './format';
import { normalize, validateValue } from './validate';

const isTouched = (cfg: ModuleConfig, r: Row) =>
  cfg.columns!.some((c) => {
    const v = (r[c.key] || '').trim();
    return v !== '' && !(c.default !== undefined && v === c.default);
  });

/** Problems with one item row, keyed by column. Used for every row on save and for the "Add item" button. */
export function itemErrors(cfg: ModuleConfig, r: Row): Record<string, string> {
  const e: Record<string, string> = {};
  for (const c of cfg.columns ?? []) {
    const v = (r[c.key] || '').trim();
    if (c.required && !v) e[c.key] = 'Required';
    else if (c.type === 'number' && v) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) e[c.key] = 'Enter a valid number';
    }
  }
  // nothing is mandatory: an empty rate simply counts as zero
  return e;
}
export const rowTouched = (cfg: ModuleConfig, r: Row) => !!cfg.columns && isTouched(cfg, r);

export interface ValidateCtx {
  docDate: string;
  number: string;
  /** every document including the recycle bin, used for the duplicate-number check */
  docs: DocRecord[];
  selfId?: string;
  home?: string;
  /** receipts: balance still due on the selected bill (not counting this receipt) */
  billBalance?: number | null;
  /** bills: money already received through receipts, so an edit cannot push the total below it */
  receivedBefore?: number;
}

export function validateDoc(cfg: ModuleConfig, data: Record<string, string>, items: Row[], ctx: ValidateCtx): Record<string, string> {
  const e: Record<string, string> = {};

  if (!ctx.number.trim()) e.number = 'Enter a document number';
  else if (ctx.docs.some((d) => d.type === cfg.slug && d.id !== ctx.selfId && d.number.trim().toLowerCase() === ctx.number.trim().toLowerCase()))
    e.number = 'This number is already used';
  if (!ctx.docDate) e.docDate = 'Pick a date';

  for (const f of cfg.sections.flatMap((s) => s.fields)) {
    if (!isVisible(f, data) || f.readOnly) continue;
    const v = (data[f.key] ?? '').trim();
    if (f.required && !v) { e[f.key] = 'Required'; continue; }
    if (!v) continue;
    if (f.validate) { const m = validateValue(f.validate, v); if (m) e[f.key] = m; }
    if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) e[f.key] = 'Enter a number';
      else if (f.min !== undefined && n < f.min) e[f.key] = `Must be ${f.min} or more`;
      else if (f.max !== undefined && n > f.max) e[f.key] = `Must be ${f.max} or less`;
    }
  }

  let started = 0;
  if (cfg.columns) {
    items.forEach((r, i) => {
      if (!isTouched(cfg, r)) return;
      started++;
      for (const [k, m] of Object.entries(itemErrors(cfg, r))) e[`item-${i}-${k}`] = m;
    });
    if (cfg.itemsRequired && started === 0) e._items = 'Add at least one item';
  }

  if (cfg.money) {
    const rows = items.filter((r) => isTouched(cfg, r));
    const m = moneyCalc({ data, items: rows }, { home: ctx.home, advanceMode: cfg.advance ?? 'required' });
    const d = num(data.discount);
    if (d < 0) e.discount = 'Cannot be negative';
    else if (data.discountType === '%' && d > 100) e.discount = 'Cannot be more than 100%';
    else if (data.discountType !== '%' && d > m.sub + 0.004) e.discount = 'Discount is more than the sub total';
    if (cfg.slug === 'bill' && ctx.receivedBefore) {
      const mb = moneyCalc({ data, items: rows }, { home: ctx.home, advanceMode: 'received', received: ctx.receivedBefore });
      if (mb.paid > mb.total + 0.004) e._total = `${inr(mb.paid)} is already received on this bill, so the total cannot go below that (new total ${inr(mb.total)}).`;
    }
    if (num(data.advance) < 0) e.advance = 'Cannot be negative';
    else if (num(data.advance) > m.total + 0.004) e.advance = `Cannot be more than the total (${inr(m.total)})`;
  }

  if (cfg.slug === 'receipt' && ctx.billBalance != null && num(data.amount) > ctx.billBalance + 0.004)
    e.amount = `Only ${inr(ctx.billBalance)} is due on this bill`;

  Object.assign(e, cfg.check?.(data, { docDate: ctx.docDate, items }) ?? {});
  return e;
}

/** Normalises phone / GSTIN / vehicle numbers etc. and drops values of hidden fields. */
export function cleanData(cfg: ModuleConfig, data: Record<string, string>) {
  const out: Record<string, string> = { ...data };
  for (const f of cfg.sections.flatMap((s) => s.fields)) {
    if (!isVisible(f, out)) { delete out[f.key]; continue; }
    if (out[f.key] !== undefined) out[f.key] = f.upper || f.validate ? normalize(f.validate, out[f.key]) || out[f.key].trim() : out[f.key].trim();
    if (out[f.key] === '') delete out[f.key];
  }
  return out;
}
