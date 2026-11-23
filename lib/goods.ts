import type { Column, ModuleConfig, Row } from './types';

/**
 * "Items list" on quotations and bills: the household goods being shifted (bed, LED TV, fridge…),
 * separate from the priced "Services & charges". Kept in the document's data as `goods` (JSON text),
 * so it works with saving, drafts, history and copying without a database change.
 */
export const GOODS_KEY = 'goods';
export const GOODS_COLUMNS: Column[] = [
  { key: 'description', label: 'Item', placeholder: 'e.g. Double bed' },
  { key: 'qty', label: 'Qty', type: 'number', default: '1' },
  { key: 'value', label: 'Value (₹)', type: 'number', placeholder: 'Optional' },
  { key: 'remarks', label: 'Remarks', placeholder: 'Fragile, new…' },
];
const MAX_ROWS = 200;

/** A small config so the same item editor can be used for the goods list. */
export const goodsConfig = (cfg: ModuleConfig): ModuleConfig => ({ ...cfg, columns: GOODS_COLUMNS, money: false, freight: false, suggest: 'household', itemsTitle: 'Items list' });

/** Reads the list from a document's data. Anything malformed is ignored. */
export function readGoods(data: Record<string, string> | undefined): Row[] {
  const raw = data?.[GOODS_KEY];
  if (!raw) return [];
  try { return cleanGoods(JSON.parse(raw)); } catch { return []; }
}

/** Keeps only known columns, short text, and rows that have something in them. */
export function cleanGoods(v: unknown): Row[] {
  if (!Array.isArray(v)) return [];
  const out: Row[] = [];
  for (const r of v.slice(0, MAX_ROWS)) {
    if (!r || typeof r !== 'object') continue;
    const row: Row = {};
    for (const c of GOODS_COLUMNS) {
      const x = (r as Record<string, unknown>)[c.key];
      row[c.key] = typeof x === 'string' || typeof x === 'number' ? String(x).slice(0, c.key === 'qty' || c.key === 'value' ? 14 : 200) : '';
    }
    if (row.description.trim() || row.remarks.trim()) out.push(row);
  }
  return out;
}

/** Text to store; empty list = nothing stored. */
export const writeGoods = (rows: Row[]): string => { const c = cleanGoods(rows); return c.length ? JSON.stringify(c) : ''; };
