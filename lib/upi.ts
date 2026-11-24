import type { Company, DocRecord, ModuleConfig } from './types';
import type { MoneyCalc } from './calc';
import { round2 } from './calc';
import { validateValue } from './validate';

/**
 * UPI payment QR for a bill (and proforma). The amount is always worked out from the saved document,
 * never typed: total after discount, surcharge, insurance and GST, minus the advance and every payment already
 * recorded. Nothing is shown when the amount is zero, the bill is cancelled, or the UPI ID is missing or malformed.
 */
export const UPI_SOFT_LIMIT = 100000; // many banks allow up to ₹1 lakh per UPI payment

export function upiAmount(rec: DocRecord, cfg: ModuleConfig, m: MoneyCalc | undefined, status: string): number {
  if (!m || !cfg.qr) return 0;
  if (rec.type === 'bill') return status === 'Cancelled' ? 0 : round2(Math.max(m.balance, 0));
  if (cfg.slug === 'proforma') return round2(Math.max(m.adv > 0 ? m.adv : m.total, 0));
  return 0; // quotations: no payment QR (the advance there is what was already paid)
}

/** Only plain letters, digits and spaces in the name and note, so the QR cannot carry anything unexpected. */
const clean = (s: string, max: number) => s.replace(/[^\p{L}\p{N} .\-/]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function upiUri(co: Pick<Company, 'upi' | 'name'>, amount: number, docNumber: string): string | null {
  const pa = (co.upi || '').replace(/\s+/g, '');
  if (!pa || validateValue('upi', pa) || !(amount > 0) || !Number.isFinite(amount)) return null;
  const ref = docNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 35);
  const params = new URLSearchParams({ pa, pn: clean(co.name || 'Payee', 50), am: amount.toFixed(2), cu: 'INR', tn: clean(`Payment for ${docNumber}`, 50), ...(ref ? { tr: ref } : {}) });
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}
