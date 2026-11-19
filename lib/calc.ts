import type { CalcLine, DocRecord, ModuleConfig, Row } from './types';

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
}

/** IGST when the supply is to another state; "Auto" compares the company state with the place of supply. */
export function isIgst(data: Record<string, string>, home?: string): boolean {
  if (data.gstMode === 'IGST') return true;
  if (data.gstMode === 'CGST + SGST') return false;
  return !!(home && data.placeOfSupply && home !== data.placeOfSupply);
}

export interface MoneyCtx { home?: string; received?: number; advanceMode?: 'received' | 'required' }

export function moneyCalc(rec: Pick<DocRecord, 'data' | 'items'>, ctx: MoneyCtx = {}): MoneyCalc {
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
