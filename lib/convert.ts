import type { DocRecord, ModuleConfig, Row } from './types';
import { isVisible } from './fields';
import { docCalc } from './ledger';
import { FREIGHT, gstChoice, lineAmount, moneyCalc, round2, validRows } from './calc';
import { GOODS_KEY, readGoods, writeGoods } from './goods';

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
  // household goods (survey / packing list items, or another document's Items list) go into the Items list,
  // not into the priced services
  const householdSource = src.type === 'survey' || src.type === 'packing';
  if (target.goods) {
    const goods = srcCfg.goods ? readGoods(src.data) : householdSource ? src.items.filter((r) => (r.description || '').trim()).map((r) => ({ description: r.description, qty: r.qty || '1', remarks: r.remarks || '' })) : [];
    const text = writeGoods(goods);
    if (text) data[GOODS_KEY] = text;
  }
  if (target.columns && !(target.goods && householdSource)) {
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
  /* ---- quotation / bill boxes that have different names in the source ---- */
  const put = (k: string, v: string | undefined) => { if (v && fields.has(k) && !data[k]) data[k] = v; };
  if (target.freight) {
    // survey list → quotation / bill
    put('movingType', src.data.serviceType);
    put('fromLift', src.data.lift);
    // quotation → bill: sender (consignor) is the customer at the old address, receiver (consignee) at the new one
    if (target.slug === 'bill' && src.type === 'quotation') {
      data.consignorSame = '0';
      put('consignorName', src.data.customerName); put('consignorPhone', src.data.customerPhone); put('consignorGst', src.data.customerGst);
      put('consigneeName', src.data.customerName); put('consigneePhone', src.data.customerPhone);
      for (const x of ['Country', 'State', 'City', 'Pincode', 'Address']) { put('consignor' + x, src.data['from' + x]); put('consignee' + x, src.data['to' + x]); put('bill' + x, src.data['from' + x]); }
      put('billingAddress', src.data.fromAddress);
    }
    // an old-style quotation with priced lines: its sub total becomes the freight
    if (srcCfg.money && src.data.calcMode !== FREIGHT) {
      const sub = round2(validRows(src.items).reduce((a, r) => a + lineAmount(r), 0));
      if (sub) data.freight = String(sub);
    }
  } else if (target.money && src.data.calcMode === FREIGHT) {
    // new-style quotation / bill → proforma (still priced lines): one line with the amount before GST
    const m = moneyCalc(src, { home });
    items = [{ description: `As per ${srcCfg.title} ${src.number}`, qty: '1', unit: 'Lump sum', rate: String(m.taxable), gst: '', hsn: '' }];
    if (src.data.gstRate) data.gstRate = ['none', 'exempt', 'extra'].includes(gstChoice(src.data.gstShow)) ? '0' : src.data.gstRate;
    if (src.data.advance) data.advance = src.data.advance;
  }

  for (const k of Object.keys(data)) if (data[k] === '') delete data[k];
  for (const f of fields.values()) if (!isVisible(f, data)) delete data[f.key];
  return { data, items };
}
