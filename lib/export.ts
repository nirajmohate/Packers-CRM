import type { Branch, DocRecord, ModuleConfig } from './types';
import { docCalc } from './ledger';
import { fmtDate } from './format';

export type Cell = string | number;
export interface Sheet { name: string; rows: Cell[][] }

const csvCell = (c: Cell) => {
  const s = String(c ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Text that starts like a formula (=, +, -, @) is opened as text, so a typed name can never run as a formula in Excel. */
export const safeCell = (c: Cell): Cell => (typeof c === 'string' && /^[=+\-@\t\r]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c) && c !== '-' ? "'" + c : c);

/** CSV exports only the first sheet; Excel exports all of them. */
export async function exportSheets(input: Sheet[], filename: string, format: 'csv' | 'xlsx') {
  const sheets = input.map((s) => ({ ...s, rows: s.rows.map((r, i) => (i === 0 ? r : r.map(safeCell))) }));
  if (format === 'csv') {
    const csv = '\ufeff' + sheets[0].rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    save(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename + '.csv');
    return;
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = s.rows[0]?.map((_, ci) => ({ wch: Math.min(40, Math.max(10, ...s.rows.map((r) => String(r[ci] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename + '.xlsx');
}

export const partyOf = (d: DocRecord, cfg: ModuleConfig) => d.data[cfg.party ?? 'customerName'] || '';

export function docRows(cfg: ModuleConfig, docs: DocRecord[], all: DocRecord[], branches: Branch[], home: (branchId?: string | null) => string | undefined): Cell[][] {
  const br = (d: DocRecord) => branches.find((b) => b.id === d.branchId)?.name ?? '';
  const isBill = cfg.slug === 'bill';
  const head: Cell[] = ['Number', 'Date', 'Status', 'Branch', cfg.party === 'payeeName' ? 'Payee' : cfg.party === 'toName' ? 'To' : 'Customer', 'Mobile', 'From', 'To city'];
  if (cfg.money || cfg.calc) head.push(isBill ? 'Taxable value' : 'Amount');
  if (isBill) head.push('CGST', 'SGST', 'IGST', 'Total', 'Received', 'Balance');
  const rows: Cell[][] = [head];
  for (const d of docs) {
    const c = docCalc(d, cfg, all, home(d.branchId));
    const row: Cell[] = [d.number, fmtDate(d.docDate), c.status, br(d), partyOf(d, cfg), d.data.customerPhone || d.data.payeePhone || '', d.data.fromCity || '', d.data.toCity || ''];
    if (isBill && c.money) {
      const m = c.money;
      row.push(m.taxable, m.igst ? 0 : m.cgst, m.igst ? 0 : m.sgst, m.igst ? m.gst : 0, m.total, m.paid, m.balance);
    } else if (cfg.money || cfg.calc) row.push(c.total);
    rows.push(row);
  }
  return rows;
}
