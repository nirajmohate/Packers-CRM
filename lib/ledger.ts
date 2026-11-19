import type { CalcLine, DocRecord, ModuleConfig } from './types';
import { moneyCalc, moneyLines, num, round2, type MoneyCalc } from './calc';

export const liveOnly = (docs: DocRecord[]) => docs.filter((d) => !d.deletedAt);

/** Receipts that settle a bill. Matched by bill id (falls back to the bill number for imported data). */
export function receiptsFor(bill: DocRecord, docs: DocRecord[], excludeId?: string) {
  return docs.filter(
    (d) => d.type === 'receipt' && !d.deletedAt && d.id !== excludeId && (d.data.againstId ? d.data.againstId === bill.id : !!d.data.againstDoc && d.data.againstDoc === bill.number),
  );
}

export function billInfo(bill: DocRecord, docs: DocRecord[], home?: string, excludeReceiptId?: string) {
  const receipts = receiptsFor(bill, docs, excludeReceiptId);
  const received = round2(receipts.reduce((a, r) => a + num(r.data.amount), 0));
  const calc: MoneyCalc = moneyCalc(bill, { home, received, advanceMode: 'received' });
  let status = 'Unpaid';
  if (bill.status === 'Cancelled') status = 'Cancelled';
  else if (calc.total > 0 && calc.balance <= 0.004) status = 'Paid';
  else if (calc.paid > 0) status = 'Partial';
  return { calc, receipts, received, status };
}

export interface DocCalc { lines: CalcLine[]; total: number; balance: number | null; status: string; money?: MoneyCalc }

/** One place that works out totals, summary lines and the live status for any document. */
export function docCalc(rec: DocRecord, cfg: ModuleConfig, docs: DocRecord[], home?: string): DocCalc {
  if (cfg.money) {
    if (rec.type === 'bill') {
      const b = billInfo(rec, docs, home);
      return { lines: moneyLines(b.calc), total: b.calc.total, balance: b.calc.balance, status: b.status, money: b.calc };
    }
    const m = moneyCalc(rec, { home, advanceMode: cfg.advance ?? 'required' });
    return { lines: moneyLines(m), total: m.total, balance: m.adv > 0 ? m.balance : null, status: rec.status, money: m };
  }
  if (cfg.calc) {
    const c = cfg.calc(rec.data);
    return { lines: c.lines, total: c.total, balance: c.balance ?? null, status: rec.status };
  }
  return { lines: [], total: 0, balance: null, status: rec.status };
}

export const statusOf = (rec: DocRecord, cfg: ModuleConfig, docs: DocRecord[], home?: string) =>
  rec.type === 'bill' ? billInfo(rec, docs, home).status : rec.status;

/** Bills that can still receive payment, with their outstanding balance. */
export function openBills(docs: DocRecord[], home?: string | ((branchId?: string) => string | undefined), excludeReceiptId?: string) {
  return liveOnly(docs)
    .filter((d) => d.type === 'bill' && d.status !== 'Cancelled')
    .map((bill) => ({ bill, info: billInfo(bill, docs, typeof home === 'function' ? home(bill.branchId) : home, excludeReceiptId) }))
    .filter((x) => x.info.calc.balance > 0.004);
}
