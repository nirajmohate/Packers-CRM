import type { Row } from './types';
import { moneyCalc } from './calc';
import { fyOf, formatNumber, DEFAULT_FORMAT } from './numbering';
import { todayISO } from './format';

export interface SeedDoc { type: string; branchCode: string; number: string; seq: number; fy: string; status: string; docDate: string; data: Record<string, string>; items: Row[]; ref?: string; billRef?: string }

const ago = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return todayISO(d); };
const PREFIX: Record<string, string> = { quotation: 'QTN', survey: 'SUR', packing: 'PKG', lr: 'LR', vehicle: 'VCR', proforma: 'PRO', bill: 'INV', receipt: 'RCT', voucher: 'PV', tws: 'TWS', fov: 'FOV', noc: 'NOC', loading: 'LS', letter: 'LTR' };

/** Sample documents used by `npm run seed:demo`. Receipts point at their bill through `billRef`. */
export function demoDocs(): SeedDoc[] {
  const out: SeedDoc[] = [];
  const counters = new Map<string, number>();
  const mk = (type: string, branchCode: string, daysAgo: number, status: string, data: Record<string, string>, items: Row[] = [], extra: Partial<SeedDoc> = {}) => {
    const docDate = ago(daysAgo);
    const fy = fyOf(docDate);
    const key = `${type}|${branchCode}|${fy}`;
    const seq = (counters.get(key) ?? 0) + 1;
    counters.set(key, seq);
    const d: SeedDoc = { type, branchCode, docDate, fy, seq, status, data, items, number: formatNumber(DEFAULT_FORMAT, { prefix: PREFIX[type], br: branchCode, fy, seq }), ...extra };
    out.push(d);
    return d;
  };
  const P = {
    rahul: { customerName: 'Rahul Mehta', customerPhone: '9876500011', fromCity: 'Pune', toCity: 'Mumbai' },
    amit: { customerName: 'Amit Sharma', customerPhone: '9876500022', fromCity: 'Nashik', toCity: 'Bengaluru' },
    neha: { customerName: 'Neha Kapoor', customerPhone: '9876500033', fromCity: 'Pune', toCity: 'Delhi' },
    vikram: { customerName: 'Vikram Singh', customerPhone: '9876500044', fromCity: 'Mumbai', toCity: 'Pune' },
  };
  const svc = (extra: Row[] = []): Row[] => [
    { description: 'Packing & loading charges', qty: '1', unit: 'Lump sum', rate: '6500', hsn: '998541' },
    { description: 'Transportation charges', qty: '1', unit: 'Trip', rate: '18500', hsn: '996511', gst: '5' },
    { description: 'Packing material', qty: '1', unit: 'Lump sum', rate: '3000', hsn: '998541' },
    ...extra,
  ];
  const money = { roundOff: '1', gstMode: 'Auto', gstRate: '18', placeOfSupply: 'Maharashtra' };

  mk('quotation', 'PUN', 3, 'Pending', { ...P.rahul, ...money, serviceType: 'Household shifting', advance: '5000' }, svc());
  mk('quotation', 'NSK', 9, 'Approved', { ...P.amit, ...money, serviceType: 'Household shifting', discountType: '%', discount: '5' }, svc([{ description: 'Unloading & unpacking', qty: '1', unit: 'Lump sum', rate: '2500', hsn: '998541' }]));
  mk('quotation', 'MUM', 1, 'Pending', { ...P.vikram, ...money, gstRate: '0', serviceType: 'Office shifting' }, svc());

  const addBill = (branch: string, days: number, p: typeof P.amit, extra: Record<string, string>, items: Row[], receipts: number | 'full' | null) => {
    const bill = mk('bill', branch, days, 'Unpaid', { ...p, ...money, ...extra }, items);
    bill.ref = bill.number;
    const total = moneyCalc(bill, { advanceMode: 'received' }).total;
    if (receipts !== null) {
      const amount = receipts === 'full' ? total - Number(extra.advance || 0) : receipts;
      if (amount > 0) mk('receipt', branch, Math.max(days - 1, 0), 'Received', { customerName: p.customerName, customerPhone: p.customerPhone, amount: String(amount), paymentMode: 'UPI', txnRef: 'UTR' + (100000 + out.length), purpose: `Payment against Bill / Invoice ${bill.number}` }, [], { billRef: bill.number });
    }
  };
  addBill('NSK', 6, P.amit, {}, svc(), 'full');
  addBill('PUN', 38, P.neha, { placeOfSupply: 'Delhi', gstRate: '5' }, svc(), 20000);
  addBill('PUN', 70, P.rahul, { advance: '10000' }, svc(), null);
  addBill('MUM', 105, P.vikram, { gstRate: '0' }, svc(), 'full');

  mk('survey', 'PUN', 12, 'Completed', { ...P.rahul, surveyorName: 'Suresh', lift: 'Yes' }, [
    { description: 'Double bed', qty: '2', cft: '60' }, { description: 'Refrigerator', qty: '1', cft: '35' }, { description: 'Sofa set (3+1+1)', qty: '1', cft: '70' },
  ]);
  mk('packing', 'NSK', 7, 'Packed', { ...P.amit, vehicleNo: 'MH15AB1234' }, [
    { description: 'LED TV', qty: '1', boxNo: 'B-1', material: 'Bubble wrap + carton', condition: 'Good' },
    { description: 'Dining table', qty: '1', boxNo: '', material: 'Stretch film', condition: 'Scratched' },
  ]);
  mk('loading', 'NSK', 6, 'Dispatched', { ...P.amit, vehicleNo: 'MH15AB1234', driverName: 'Ramesh', loadingStart: '09:30', loadingEnd: '12:15', loadedBy: 'Team A' }, [
    { description: 'Carton boxes', qty: '38', remarks: '' }, { description: 'Furniture (wrapped)', qty: '6', remarks: 'Top-load' },
  ]);
  mk('lr', 'NSK', 6, 'In transit', { ...P.amit, consigneeName: 'Amit Sharma', vehicleNo: 'MH15AB1234', driverName: 'Ramesh', paymentMode: 'To pay', freight: '18500', hamali: '1500', lrGst: '5', advance: '5000' }, [
    { description: 'Household goods', packages: '44', weight: '1800' },
  ]);
  mk('tws', 'NSK', 6, 'Completed', { ...P.amit, vehicleNo: 'MH15AB1234', weighbridge: 'Nashik Dharmakanta', slipNo: 'WB-4471', grossWeight: '5200', tareWeight: '3400', netWeight: '1800', weighmentCharge: '150' });
  mk('fov', 'PUN', 5, 'Completed', { ...P.neha, goodsValue: '400000', fovRate: '1', fovAmount: '4000', scfCharge: '500', insured: 'No' });
  mk('noc', 'PUN', 4, 'Issued', { ...P.rahul, societyName: 'Green Heights CHS', flatNo: 'B-402', shiftType: 'Moving out', moveDate: ago(-2), duesCleared: 'Yes', authorityName: 'S. Kulkarni', authorityDesignation: 'Secretary' });
  mk('voucher', 'PUN', 2, 'Paid', { payeeName: 'Ganesh Labour Contractor', category: 'Driver / labour', amount: '4500', paymentMode: 'Cash', particulars: 'Labour for Rahul Mehta survey and packing' });
  return out;
}
