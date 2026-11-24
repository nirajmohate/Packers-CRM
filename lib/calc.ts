import type { CalcLine, DocRecord, ModuleConfig, Row } from './types';
import { readGoods } from './goods';

export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const lineAmount = (r: Row) => round2(num(r.qty) * num(r.rate));
export const validRows = (items: Row[]) => items.filter((r) => (r.description || '').trim());

export interface TaxRow { rate: number; taxable: number; gst: number; cgst: number; sgst: number }
export interface MoneyCalc {
  sub: number; disc: number; discType: '₹' | '%'; discValue: number;
  taxable: number; tax: TaxRow[]; gst: number; cgst: number; sgst: number; igst: boolean;
  roundOff: number; total: number; adv: number; received: number; paid: number; balance: number;
  advanceMode: 'received' | 'required';
  /** freight-style documents (quotation / bill): the charge lines, optional extras and notes */
  freight?: boolean;
  charges?: CalcLine[];
  extras?: CalcLine[];
  optional?: CalcLine[];
  notes?: string[];
  reverseCharge?: boolean;
  hideTotal?: boolean;
  /** which of the six GST choices applies */
  gstMode?: GstChoice;
  /** GST shown as "extra" (not in the total) */
  gstExtra?: number;
}

/** The GST choices on a quotation / bill (same list as the format your staff use). */
export type GstChoice = 'show' | 'rateOnly' | 'none' | 'exempt' | 'extra' | 'inclusive';
export const gstOptions = (doc: 'Quotation' | 'Bill') => [
  `GST Charge Show In ${doc}`, 'GST % Show & GST Charge Hide', `Without GST ${doc}`, 'GST Exempted', 'GST Extra', 'GST Included in Subtotal',
];
export function gstChoice(v?: string): GstChoice {
  const s = (v || '').toLowerCase();
  if (s.startsWith('gst % show')) return 'rateOnly';
  if (s.startsWith('without gst') || s === 'gst charge hide') return 'none'; // "GST Charge Hide" was the old name
  if (s.includes('exempt')) return 'exempt';
  if (s === 'gst extra') return 'extra';
  if (s.includes('included in subtotal')) return 'inclusive';
  return 'show';
}

/** IGST when the supply is to another state; "Auto" compares the company state with the place of supply. */
export function isIgst(data: Record<string, string>, home?: string): boolean {
  if (data.gstMode === 'IGST') return true;
  if (data.gstMode === 'CGST + SGST') return false;
  return !!(home && data.placeOfSupply && home !== data.placeOfSupply);
}

export interface MoneyCtx { home?: string; received?: number; advanceMode?: 'received' | 'required' }

export function moneyCalc(rec: Pick<DocRecord, 'data' | 'items'>, ctx: MoneyCtx = {}): MoneyCalc {
  if (rec.data.calcMode === FREIGHT) return freightCalc(rec.data, ctx);
  const rows = validRows(rec.items);
  const amts = rows.map(lineAmount);
  const sub = round2(amts.reduce((a, b) => a + b, 0));
  const discType: '₹' | '%' = rec.data.discountType === '%' ? '%' : '₹';
  const discValue = Math.max(num(rec.data.discount), 0);
  const disc = round2(discType === '%' ? (Math.min(discValue, 100) * sub) / 100 : Math.min(discValue, sub));

  // discount is spread over the lines in proportion to their amounts (the last line takes the rounding remainder)
  const defRate = num(rec.data.gstRate);
  const groups = new Map<number, number>();
  let used = 0;
  rows.forEach((r, i) => {
    const share = i === rows.length - 1 ? round2(disc - used) : sub ? round2((disc * amts[i]) / sub) : 0;
    used = round2(used + share);
    const taxableLine = round2(amts[i] - share);
    const rate = (r.gst ?? '') !== '' ? num(r.gst) : defRate;
    groups.set(rate, round2((groups.get(rate) ?? 0) + taxableLine));
  });
  const tax: TaxRow[] = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rate, taxable]) => {
    const gst = round2((taxable * rate) / 100);
    const cgst = round2(gst / 2);
    return { rate, taxable, gst, cgst, sgst: round2(gst - cgst) };
  });
  const taxable = round2(tax.reduce((a, t) => a + t.taxable, 0));
  const gst = round2(tax.reduce((a, t) => a + t.gst, 0));
  const cgst = round2(tax.reduce((a, t) => a + t.cgst, 0));
  const sgst = round2(tax.reduce((a, t) => a + t.sgst, 0));
  const pre = round2(taxable + gst);
  const roundOff = rec.data.roundOff === '1' ? round2(Math.round(pre) - pre) : 0;
  const total = round2(pre + roundOff);

  const advanceMode = ctx.advanceMode ?? 'required';
  const adv = Math.max(num(rec.data.advance), 0);
  const received = round2(ctx.received ?? 0);
  const paid = advanceMode === 'received' ? round2(adv + received) : 0;
  const balance = round2(Math.max(total - (advanceMode === 'received' ? paid : adv), 0));
  return { sub, disc, discType, discValue, taxable, tax, gst, cgst, sgst, igst: isIgst(rec.data, ctx.home), roundOff, total, adv, received, paid, balance, advanceMode };
}

export function moneyLines(m: MoneyCalc): CalcLine[] {
  if (m.freight) return freightLines(m);
  const out: CalcLine[] = [{ label: 'Sub total', value: m.sub }];
  if (m.disc > 0) out.push({ label: `Discount${m.discType === '%' ? ` (${m.discValue}%)` : ''}`, value: -m.disc });
  if (m.disc > 0 && m.gst > 0) out.push({ label: 'Taxable amount', value: m.taxable });
  for (const t of m.tax) {
    if (t.rate <= 0) continue;
    if (m.igst) out.push({ label: `IGST @ ${t.rate}%`, value: t.gst });
    else {
      out.push({ label: `CGST @ ${t.rate / 2}%`, value: t.cgst });
      out.push({ label: `SGST @ ${t.rate / 2}%`, value: t.sgst });
    }
  }
  if (m.roundOff !== 0) out.push({ label: 'Round off', value: m.roundOff });
  out.push({ label: 'Total', value: m.total, bold: true });
  if (m.advanceMode === 'received') {
    if (m.adv > 0) out.push({ label: 'Advance received', value: m.adv });
    if (m.received > 0) out.push({ label: 'Payments received', value: m.received });
    if (m.paid > 0) out.push({ label: 'Balance due', value: m.balance, bold: true });
  } else if (m.adv > 0) {
    out.push({ label: 'Advance payable', value: m.adv });
    out.push({ label: 'Balance after advance', value: m.balance, bold: true });
  }
  return out;
}

/** Short totals shown under item lists (volume, weight, packages, quantity). */
export function summary(rec: Pick<DocRecord, 'items'>, cfg: ModuleConfig): [string, number][] {
  if (!cfg.columns) return [];
  const has = (k: string) => cfg.columns!.some((c) => c.key === k);
  const rows = validRows(rec.items);
  const out: [string, number][] = [];
  if (has('cft')) out.push(['Total volume (CFT)', round2(rows.reduce((a, r) => a + num(r.qty) * num(r.cft), 0))]);
  if (has('weight')) out.push(['Total weight (kg)', round2(rows.reduce((a, r) => a + num(r.weight), 0))]);
  if (has('packages')) out.push(['Total packages', rows.reduce((a, r) => a + num(r.packages), 0)]);
  if (!cfg.money && !has('packages') && has('qty')) out.push(['Total quantity', round2(rows.reduce((a, r) => a + num(r.qty), 0))]);
  return out;
}

/* ================= freight-style quotation / bill ================= */
/*
 * Freight + charge boxes (each "Included in freight" or an extra amount) + other charges = sub total,
 * minus discount, plus surcharge (% of freight) = taxable, plus GST (unless hidden or reverse charge),
 * plus insurance and vehicle insurance when "Included" (each with its own GST %). "Optional" insurance is
 * shown on the document but not added to the total.
 */
export const FREIGHT = 'freight';
export const INCLUDED = 'Included in Freight';
export const EXTRA = 'Extra charge';
export const MODE_CHARGES: [string, string][] = [
  ['packing', 'Packing charge'], ['unpacking', 'Unpacking charge'], ['loading', 'Loading charge'],
  ['unloading', 'Unloading charge'], ['packingMaterial', 'Packing material charge'],
];
export const PLAIN_CHARGES: [string, string][] = [
  ['storageCharge', 'Storage charge'], ['carTransportCharge', 'Car transport charge'], ['miscCharge', 'Miscellaneous charges'],
  ['otherCharge', 'Other charges'], ['stCharge', 'S.T. charge'], ['greenTax', 'Octroi / green tax'],
];

function freightCalc(d: Record<string, string>, ctx: MoneyCtx): MoneyCalc {
  const pos = (k: string) => Math.max(num(d[k]), 0);
  const freight = pos('freight');
  const charges: CalcLine[] = [{ label: 'Freight charge', value: freight }];
  const included: string[] = [];
  for (const [k, label] of MODE_CHARGES) {
    const mode = d[k + 'Mode'];
    if (mode === EXTRA) charges.push({ label, value: pos(k + 'Charge') });
    else if (mode === INCLUDED) included.push(label.replace(/ charge$/, '').toLowerCase());
  }
  // all charges that are part of the freight on one line
  if (included.length) charges.splice(1, 0, { label: `${included.join(', ').replace(/^./, (c) => c.toUpperCase())}`, value: 0, text: 'Included in freight' });
  for (const [k, label] of PLAIN_CHARGES) if (pos(k) > 0) charges.push({ label, value: pos(k) });
  const sub = round2(charges.reduce((a, c) => a + c.value, 0));

  const discType: '₹' | '%' = d.discountType === '%' ? '%' : '₹';
  const discValue = pos('discount');
  const disc = round2(discType === '%' ? (Math.min(discValue, 100) * sub) / 100 : Math.min(discValue, sub));
  const surPct = d.surchargeMode === 'Applicable' ? pos('surchargePct') : 0;
  const surcharge = round2((freight * surPct) / 100);
  const extras: CalcLine[] = surcharge > 0 ? [{ label: `Surcharge @ ${surPct}% on freight`, value: surcharge }] : [];

  const mode = gstChoice(d.gstShow);
  const charged = mode === 'show' || mode === 'rateOnly' || mode === 'inclusive';
  const groups = new Map<number, number>(); // rate -> taxable value
  let extraGst = 0;
  let typed = 0; // amounts as typed (for "inclusive", these already contain the GST)
  /** adds an amount at a GST rate; "inclusive" amounts already contain the GST, so the taxable value is taken out of them */
  const addTax = (rate: number, amount: number) => {
    if (!amount) return;
    typed = round2(typed + amount);
    let taxable = amount;
    if (mode === 'inclusive' && rate > 0) taxable = round2((amount * 100) / (100 + rate));
    if (mode === 'extra' && rate > 0) extraGst = round2(extraGst + (amount * rate) / 100);
    const r = charged ? rate : 0;
    groups.set(r, round2((groups.get(r) ?? 0) + taxable));
  };
  addTax(pos('gstRate'), round2(sub - disc + surcharge));

  // insurance: on the declared value (or the total value of the Items list when no value is typed)
  const goodsValue = round2(readGoods(d).reduce((a, r) => a + num(r.value), 0));
  const optional: CalcLine[] = [];
  const insurance = (prefix: string, label: string, fallback: number) => {
    const type = d[prefix + 'Type'];
    if (!type || type === 'Not Applicable') return;
    const value = pos(prefix + 'Value') || fallback;
    const pct = pos(prefix + 'Pct');
    const amt = round2((value * pct) / 100);
    if (!amt) return;
    const text = `${label} @ ${pct}% on ${value.toLocaleString('en-IN')}`;
    if (type === 'Optional') { optional.push({ label: `${text} (optional, not in total)`, value: amt }); return; }
    extras.push({ label: text, value: amt });
    addTax(pos(prefix + 'Gst'), amt);
  };
  insurance('ins', 'Insurance', goodsValue);
  insurance('vins', 'Vehicle insurance', 0);

  const tax: TaxRow[] = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([rate, taxable]) => {
    const gst = round2((taxable * rate) / 100);
    const cgst = round2(gst / 2);
    return { rate, taxable, gst, cgst, sgst: round2(gst - cgst) };
  });
  const taxable = round2(tax.reduce((a, t) => a + t.taxable, 0));
  const gst = round2(tax.reduce((a, t) => a + t.gst, 0));
  const cgst = round2(tax.reduce((a, t) => a + t.cgst, 0));
  const sgst = round2(tax.reduce((a, t) => a + t.sgst, 0));

  // inclusive: taxable + GST must add up to exactly what was typed (no 1-paisa drift from rounding)
  if (mode === 'inclusive' && tax.length) {
    const drift = round2(typed - (taxable + gst));
    if (drift) { const t = tax[tax.length - 1]; t.taxable = round2(t.taxable + drift); }
  }
  const taxable2 = round2(tax.reduce((a, t) => a + t.taxable, 0));
  const reverseCharge = d.reverseCharge === 'Yes';
  const pre = round2(taxable2 + (reverseCharge ? 0 : gst));
  const roundOff = d.roundOff === '1' ? round2(Math.round(pre) - pre) : 0;
  const total = round2(pre + roundOff);
  const notes: string[] = [];
  if (mode === 'exempt') notes.push('GST exempted');
  if (mode === 'extra' && extraGst > 0) notes.push(`GST @ ${pos('gstRate')}% extra as applicable`);
  if (pos('perUnitRate') > 0) notes.push(`Rate: Rs. ${pos('perUnitRate')} ${d.perUnit || 'Per KG'}`);
  if (reverseCharge) notes.push('GST payable on reverse charge basis');
  if (d.gstPaidBy && gst > 0) notes.push(`GST paid by: ${d.gstPaidBy}`);

  const advanceMode = ctx.advanceMode ?? 'required';
  const adv = pos('advance');
  const received = round2(ctx.received ?? 0);
  const paid = advanceMode === 'received' ? round2(adv + received) : 0;
  const balance = round2(Math.max(total - (advanceMode === 'received' ? paid : adv), 0));
  return {
    sub, disc, discType, discValue, taxable: taxable2, tax, gst, cgst, sgst, igst: isIgst(d, ctx.home), roundOff, total, adv, received, paid, balance, advanceMode,
    freight: true, charges, extras, optional, notes, reverseCharge, hideTotal: d.totalShow === 'Hide', gstMode: mode, gstExtra: extraGst,
  };
}

function freightLines(m: MoneyCalc): CalcLine[] {
  const out: CalcLine[] = [...(m.charges ?? [])];
  out.push({ label: 'Sub total', value: m.sub, bold: true });
  if (m.disc > 0) out.push({ label: `Discount${m.discType === '%' ? ` (${m.discValue}%)` : ''}`, value: -m.disc });
  out.push(...(m.extras ?? []));
  const rates = m.tax.filter((t) => t.rate > 0);
  if (m.gstMode === 'rateOnly') {
    // "GST % Show & GST Charge Hide": the rate is shown, the GST amount is not (it is inside the total)
    for (const t of rates) out.push({ label: `GST @ ${t.rate}%${m.igst ? ' (IGST)' : ' (CGST + SGST)'}`, value: 0, text: 'Included in total' });
  } else {
    if (m.gstMode === 'inclusive' && rates.length) out.push({ label: 'Taxable value', value: round2(m.tax.reduce((a, t) => a + t.taxable, 0)) });
    const inc = m.gstMode === 'inclusive' ? ' (included)' : '';
    for (const t of rates) {
      const rc = m.reverseCharge ? ' (reverse charge)' : '';
      if (m.igst) out.push({ label: `IGST @ ${t.rate}%${inc}${rc}`, value: t.gst });
      else {
        out.push({ label: `CGST @ ${t.rate / 2}%${inc}${rc}`, value: t.cgst });
        out.push({ label: `SGST @ ${t.rate / 2}%${inc}${rc}`, value: t.sgst });
      }
    }
  }
  if (m.gstMode === 'exempt') out.push({ label: 'GST', value: 0, text: 'Exempted' });
  if (m.roundOff !== 0) out.push({ label: 'Round off', value: m.roundOff });
  out.push({ label: 'Total', value: m.total, bold: true });
  if (m.advanceMode === 'received') {
    if (m.adv > 0) out.push({ label: 'Advance received', value: m.adv });
    if (m.received > 0) out.push({ label: 'Payments received', value: m.received });
    if (m.paid > 0) out.push({ label: 'Balance due', value: m.balance, bold: true });
  } else if (m.adv > 0) {
    out.push({ label: 'Advance paid', value: m.adv });
    out.push({ label: 'Balance', value: m.balance, bold: true });
  }
  if (m.gstMode === 'extra' && (m.gstExtra ?? 0) > 0) out.push({ label: 'GST extra (not in total)', value: m.gstExtra ?? 0 });
  out.push(...(m.optional ?? []));
  return out;
}
