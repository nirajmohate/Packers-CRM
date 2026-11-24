import type { Branch, Company, DocRecord, ModuleConfig } from './types';

/** QTN/DEL/23-11-26/01: document code / branch / date of the document / running number of that day */
export const DEFAULT_FORMAT = '{PREFIX}/{BR}/{DATE}/{NN}';
/** the format used before 0.8; settings still holding it are moved to the new default */
export const OLD_DEFAULT_FORMAT = '{PREFIX}/{BR}/{FY}/{NNNN}';
/** a format with {DATE} restarts its running number every day */
export const isDaily = (fmt: string) => /\{DATE\}/.test(fmt || DEFAULT_FORMAT);
/** "2026-11-23" → "23-11-26" */
export const dateToken = (iso: string) => { const [y, m, d] = (iso || '').slice(0, 10).split('-'); return y && m && d ? `${d}-${m}-${y.slice(2)}` : ''; };

/** Indian financial year (April to March) as "2026-27" */
export function fyOf(iso: string): string {
  const [y, m] = (iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m) return '';
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const hasSeqToken = (fmt: string) => /\{N{1,8}\}/.test(fmt);

export function formatNumber(fmt: string, p: { prefix: string; br: string; fy: string; seq: number; date?: string }) {
  return (fmt || DEFAULT_FORMAT)
    .replace(/\{DATE\}/g, dateToken(p.date ?? ''))
    .replace(/\{PREFIX\}/g, p.prefix)
    .replace(/\{BR\}/g, p.br)
    .replace(/\{FY\}/g, p.fy)
    .replace(/\{YY\}/g, p.fy.slice(2, 4))
    .replace(/\{(N{1,8})\}/g, (_, n: string) => String(p.seq).padStart(n.length, '0'));
}

const seqOf = (d: DocRecord) => d.seq ?? (parseInt(d.number.match(/(\d+)\s*$/)?.[1] ?? '0', 10) || 0);

/** `docs` must include deleted documents so numbers are never reused. */
export function buildNumber(cfg: ModuleConfig, docs: DocRecord[], co: Pick<Company, 'numberFormat' | 'numberPerBranch' | 'numberFyReset'>, branch: Branch | undefined, dateISO: string) {
  const fy = fyOf(dateISO);
  let max = 0;
  for (const d of docs) {
    if (d.type !== cfg.slug) continue;
    if (co.numberPerBranch && (d.branchId ?? '') !== (branch?.id ?? '')) continue;
    if (co.numberFyReset && (d.fy ?? fyOf(d.docDate)) !== fy) continue;
    if (isDaily(co.numberFormat) && d.docDate !== dateISO.slice(0, 10)) continue;
    max = Math.max(max, seqOf(d));
  }
  const seq = max + 1;
  return { seq, fy, number: formatNumber(co.numberFormat, { prefix: cfg.prefix, br: branch?.code || 'BR', fy, seq, date: dateISO }) };
}
