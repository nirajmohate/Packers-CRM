import type { Company } from './types';
import { DEFAULT_FORMAT } from './numbering';

export const DEFAULT_COMPANY: Company = {
  name: 'Cloud Packers', tagline: 'Packers & Movers', contactPerson: '', address: '', state: '', phone: '', email: '',
  gstin: '', pan: '', bankName: '', accountName: '', accountNo: '', ifsc: '', upi: '',
  logoId: '', logoRatio: 1, stampId: '', stampRatio: 1, signatureId: '', signRatio: 2,
  numberFormat: DEFAULT_FORMAT, numberPerBranch: true, numberFyReset: true,
  pdfStamp: true, pdfQr: true, pdfWatermark: true,
};

/** Fields a branch may override. Everything else is company-wide. */
export const PROFILE_KEYS = [
  'name', 'tagline', 'contactPerson', 'address', 'state', 'phone', 'email', 'gstin', 'pan',
  'bankName', 'accountName', 'accountNo', 'ifsc', 'upi', 'logoId', 'logoRatio', 'stampId', 'stampRatio', 'signatureId', 'signRatio',
] as const;
export const RULE_KEYS = ['numberFormat', 'numberPerBranch', 'numberFyReset', 'pdfStamp', 'pdfQr', 'pdfWatermark'] as const;
