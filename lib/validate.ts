import type { Validator } from './types';

const RX = {
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  pan: /^[A-Z]{5}\d{4}[A-Z]$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  vehicle: /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{2})$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  upi: /^[\w.\-]{2,}@[A-Za-z][A-Za-z0-9]{1,}$/,
  pincode: /^\d{6}$/,
};

export const phoneDigits = (v: string) => {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};

export function normalize(kind: Validator | undefined, v: string): string {
  const s = (v ?? '').trim();
  if (!s) return '';
  switch (kind) {
    case 'phone': { const d = phoneDigits(s); return d.length === 10 ? d : s; }
    case 'gstin': case 'pan': case 'ifsc': return s.replace(/\s+/g, '').toUpperCase();
    case 'vehicle': return s.replace(/[\s-]+/g, '').toUpperCase();
    case 'email': return s.toLowerCase();
    case 'upi': return s.replace(/\s+/g, '');
    default: return s;
  }
}

/** Returns an error message, or '' when the value is fine (empty values are fine; "required" is checked elsewhere). */
export function validateValue(kind: Validator, raw: string): string {
  const v = normalize(kind, raw);
  if (!v) return '';
  switch (kind) {
    case 'phone': return /^[6-9]\d{9}$/.test(phoneDigits(v)) ? '' : 'Enter a valid 10-digit mobile number';
    case 'gstin': return RX.gstin.test(v) ? '' : 'GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5';
    case 'pan': return RX.pan.test(v) ? '' : 'PAN must look like ABCDE1234F';
    case 'ifsc': return RX.ifsc.test(v) ? '' : 'IFSC must look like HDFC0001234';
    case 'vehicle': return RX.vehicle.test(v) ? '' : 'Vehicle number must look like MH15AB1234';
    case 'email': return RX.email.test(v) ? '' : 'Enter a valid email address';
    case 'upi': return RX.upi.test(v) ? '' : 'UPI ID must look like name@bank';
    case 'pincode': return RX.pincode.test(v) ? '' : 'Pincode must be 6 digits';
  }
}
