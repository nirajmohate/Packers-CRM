/** Customers / leads that a branch owner adds by hand. Shared by the browser and the server (no server imports here). */

export const LEAD_STATUSES = ['Lead generated', 'Contacted', 'Follow-up', 'Quotation sent', 'Converted', 'Not responded', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_HI: Record<string, string> = {
  'Lead generated': 'नई लीड', Contacted: 'बात हुई', 'Follow-up': 'फॉलो-अप', 'Quotation sent': 'कोटेशन भेजा',
  Converted: 'कन्फर्म', 'Not responded': 'जवाब नहीं', Lost: 'नहीं हुआ',
};
/** red = still open, blue = working on it, green = won, grey = closed without business */
export const LEAD_TONE: Record<string, 'red' | 'blue' | 'green' | 'grey'> = {
  'Lead generated': 'red', Contacted: 'blue', 'Follow-up': 'blue', 'Quotation sent': 'blue', Converted: 'green', 'Not responded': 'grey', Lost: 'grey',
};

export const LEAD_SOURCES = ['Phone call', 'WhatsApp', 'Walk-in', 'Website', 'Google / JustDial', 'Facebook / Instagram', 'IndiaMART / Sulekha', 'Reference', 'Old customer', 'Other'];
export const LEAD_TYPES = ['Hot', 'Warm', 'Cold'];
/** Same names as the "Moving type" list on the quotation, so the value carries over unchanged. */
export const SHIFTING_TYPES = ['Household Shifting', 'Local Shifting', 'Domestic Shifting', 'International Shifting', 'Office Shifting', 'Car Transportation', 'Bike Transportation', 'Commercial Goods', 'Warehouse / Storage'];
export const ITEM_TYPES = ['1 RK', '1 BHK', '2 BHK', '3 BHK', '4 BHK / Villa', 'Few items', 'Office goods', 'Car', 'Bike', 'Other'];

export interface Lead {
  id: string;
  branchId: string;
  name: string;
  email: string;
  phone: string;
  leadDate: string; // yyyy-mm-dd
  moveDate: string;
  followUpDate: string;
  fromCity: string;
  toCity: string;
  fromAddress: string;
  toAddress: string;
  leadSource: string;
  leadType: string;
  shiftingType: string;
  itemType: string;
  status: string;
  remarks: string;
  docs: { type: string; id: string; number: string }[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

/** The editable fields (everything else is set by the server). */
export const LEAD_FIELDS = ['name', 'email', 'phone', 'leadDate', 'moveDate', 'followUpDate', 'fromCity', 'toCity', 'fromAddress', 'toAddress', 'leadSource', 'leadType', 'shiftingType', 'itemType', 'status', 'remarks'] as const;
export type LeadInput = Partial<Record<(typeof LEAD_FIELDS)[number], string>> & { branchId?: string };

/**
 * The document fields a lead can fill in. Only keys that exist on the form being opened are used,
 * so the same map works for quotation, survey, LR, bill and the rest.
 */
export function leadToDocData(l: Pick<Lead, 'name' | 'email' | 'phone' | 'fromCity' | 'toCity' | 'fromAddress' | 'toAddress' | 'moveDate' | 'shiftingType' | 'itemType' | 'remarks'>): Record<string, string> {
  const out: Record<string, string> = {
    customerName: l.name, customerPhone: l.phone, customerEmail: l.email,
    fromCity: l.fromCity, toCity: l.toCity, fromAddress: l.fromAddress, toAddress: l.toAddress,
    moveDate: l.moveDate, packingDate: l.moveDate,
    movingType: l.shiftingType,
  };
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
