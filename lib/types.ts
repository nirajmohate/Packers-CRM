export type FieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'tel' | 'bill' | 'check';
export type Validator = 'phone' | 'gstin' | 'pan' | 'email' | 'vehicle' | 'ifsc' | 'upi' | 'pincode';
export type Row = Record<string, string>;

export interface ShowIf { key: string; in?: string[]; notIn?: string[] }

export interface Field {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  required?: boolean;
  half?: boolean;
  money?: boolean;
  placeholder?: string;
  hint?: string;
  validate?: Validator;
  showIf?: ShowIf;
  readOnly?: boolean;
  min?: number;
  max?: number;
  rows?: number;
  upper?: boolean;
  /** typing shows these as suggestions, but anything can be typed ("select or type") */
  suggestions?: string[];
}

export interface Column {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  placeholder?: string;
  wide?: boolean;
  required?: boolean;
  default?: string;
  emptyLabel?: string;
}

export interface Section {
  title: string;
  fields: Field[];
  /** false: used for the totals only, not listed field by field on the document page and PDF */
  print?: boolean;
}

export interface CalcLine { label: string; value: number; bold?: boolean; /** shown instead of the amount, e.g. "Included" */ text?: string }
export interface CustomCalc { lines: CalcLine[]; total: number; balance?: number }

export interface ModuleConfig {
  slug: string;
  title: string;
  short: string;
  prefix: string;
  color: string;
  icon: string;
  isNew?: boolean;
  /** data key holding the person's name (lists, customers). Defaults to customerName */
  party?: string;
  sections: Section[];
  columns?: Column[];
  itemsTitle?: string;
  itemsRequired?: boolean;
  suggest?: 'services' | 'household';
  /** items are qty x rate with discount / per-line GST / round-off */
  money?: boolean;
  /** has the household "Items list" (bed, TV…) before the priced services */
  goods?: boolean;
  /** totals come from Freight + charge boxes + surcharge + insurance + GST (quotation / bill) */
  freight?: boolean;
  /** starting values for a new document */
  defaults?: Record<string, string>;
  advance?: 'received' | 'required';
  advanceLabel?: string;
  /** totals for non-money documents */
  calc?: (d: Record<string, string>) => CustomCalc;
  statuses: string[];
  terms: string[];
  bank?: boolean;
  /** show a UPI QR on the PDF */
  qr?: boolean;
  letter?: boolean;
  signLabels: [string, string];
  derive?: (d: Record<string, string>) => Record<string, string>;
  deriveOn?: string[];
  check?: (d: Record<string, string>, ctx: { docDate: string; items: Row[] }) => Record<string, string>;
}

export interface DocRecord {
  id: string;
  type: string;
  number: string;
  seq?: number;
  fy?: string;
  status: string;
  docDate: string;
  branchId?: string;
  deletedAt?: string;
  /** why it was deleted and by whom (shown in the recycle bin) */
  deleteReason?: string;
  deletedByName?: string;
  createdAt: string;
  updatedAt: string;
  rev?: number;
  createdByName?: string;
  updatedByName?: string;
  data: Record<string, string>;
  items: Row[];
}

export interface Branch { id: string; name: string; code: string; city: string; address: string; phone: string; active?: boolean }

/** Company details. A branch can override any of these; empty means "use the company default". */
export interface CompanyProfile {
  name: string;
  tagline: string;
  contactPerson: string;
  address: string;
  state: string;
  phone: string;
  email: string;
  gstin: string;
  pan: string;
  bankName: string;
  accountName: string;
  accountNo: string;
  ifsc: string;
  upi: string;
  logoId: string;
  logoRatio: number;
  stampId: string;
  stampRatio: number;
  signatureId: string;
  signRatio: number;
}

/** Effective settings for one branch: profile + company-wide rules. */
export interface Company extends CompanyProfile {
  numberFormat: string;
  numberPerBranch: boolean;
  numberFyReset: boolean;
  pdfStamp: boolean;
  pdfQr: boolean;
  pdfWatermark: boolean;
}

export interface SettingsBundle {
  global: Company;
  branch: Record<string, Partial<CompanyProfile>>;
  terms: { global: Record<string, string[]>; branch: Record<string, Record<string, string[]>> };
}

export interface SessionUser {
  id: string;
  name: string;
  loginId: string;
  role: 'admin' | 'manager' | 'team';
  branchId: string | null;
  mustChangePassword: boolean;
}

export interface AuditChange { field: string; from: string; to: string }
export interface AuditEntry {
  id: string;
  at: string;
  userId?: string;
  userName: string;
  role: string;
  action: string;
  entity: string;
  entityId?: string;
  docType?: string;
  docNumber?: string;
  branchId?: string;
  summary: string;
  changes?: AuditChange[];
}
