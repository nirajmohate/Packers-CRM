import type { DocRecord, ModuleConfig, Row } from './types';
import { isVisible } from './fields';
import { docCalc } from './ledger';
import { round2 } from './calc';

/** Build a pre-filled draft for `target` from an existing document. */
export function prefillFrom(src: DocRecord, srcCfg: ModuleConfig, target: ModuleConfig, docs: DocRecord[], home?: string) {
  const fields = new Map(target.sections.flatMap((s) => s.fields).map((f) => [f.key, f]));
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(src.data)) {
    const f = fields.get(k);
    if (!f || !v || f.readOnly || f.type === 'bill') continue;
    if (f.type === 'select' && !f.options?.includes(v)) continue;
    data[k] = v;
  }
  let items: Row[] = [];
  if (target.columns) {
    const cols = target.columns;
    items = src.items
      .filter((r) => (r.description || '').trim())
      .map((r) => {
        const o: Row = {};
        cols.forEach((c) => {
          const v = r[c.key];
          if (v !== undefined && v !== '' && !(c.type === 'select' && !c.options?.includes(v))) o[c.key] = v;
          else if (c.default !== undefined) o[c.key] = c.default;
          else o[c.key] = '';
        });
        return o;
      });
  }
  if (target.money && srcCfg.money) {
    ['discountType', 'discount', 'gstRate', 'gstMode', 'roundOff', 'notes'].forEach((k) => { if (src.data[k]) data[k] = src.data[k]; });
  }
  if (target.slug === 'receipt' && src.type === 'bill') {
    const c = docCalc(src, srcCfg, docs, home);
    data.againstId = src.id;
    data.againstDoc = src.number;
    data.amount = String(round2(c.balance ?? c.total));
    data.purpose = `Payment against ${srcCfg.title} ${src.number}`;
  } else if (target.slug === 'receipt' && src.type === 'proforma') {
    const c = docCalc(src, srcCfg, docs, home);
    data.amount = String(round2(c.money?.adv || c.total));
    data.purpose = `Payment against ${srcCfg.title} ${src.number}`;
  }
  if (target.slug === 'fov') data.remarks = `Linked to ${srcCfg.title} ${src.number}`;
  for (const k of Object.keys(data)) if (data[k] === '') delete data[k];
  for (const f of fields.values()) if (!isVisible(f, data)) delete data[f.key];
  return { data, items };
}
