import type { Branch, Company, DocRecord, ModuleConfig } from './types';

export const DEFAULT_FORMAT = '{PREFIX}/{BR}/{FY}/{NNNN}';

/** Indian financial year (April to March) as "2026-27" */
export function fyOf(iso: string): string {
  const [y, m] = (iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m) return '';
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const hasSeqToken = (fmt: string) => /\{N{1,8}\}/.test(fmt);

export function formatNumber(fmt: string, p: { prefix: string; br: string; fy: string; seq: number }) {
  return (fmt || DEFAULT_FORMAT)
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
    max = Math.max(max, seqOf(d));
  }
  const seq = max + 1;
  return { seq, fy, number: formatNumber(co.numberFormat, { prefix: cfg.prefix, br: branch?.code || 'HO', fy, seq }) };
}
