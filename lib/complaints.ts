/** Customer complaints from the cloudpackers.com complaint form. Shared by browser and server. */

export const COMPLAINT_STATUSES = ['New', 'Forwarded', 'In progress', 'Called - no answer', 'Resolved', 'Closed'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const OPEN_STATUSES = new Set<string>(['New', 'Forwarded', 'In progress', 'Called - no answer']);
export const COMPLAINT_TONE: Record<string, string> = {
  New: 'bg-red-100 text-red-700 ring-red-300', Forwarded: 'bg-orange-100 text-orange-800 ring-orange-300', 'In progress': 'bg-sky-100 text-sky-800 ring-sky-300',
  'Called - no answer': 'bg-amber-100 text-amber-800 ring-amber-300', Resolved: 'bg-emerald-100 text-emerald-800 ring-emerald-300', Closed: 'bg-slate-100 text-slate-600 ring-slate-300',
};
/** A complaint with no status change or note for this long is "overdue" (reminder popup). */
export const OVERDUE_MS = 48 * 3600_000;

export interface ComplaintEvent { at: string; byName: string; action: string; note?: string }
export interface Complaint {
  id: string; ref: string; name: string; phone: string; email: string; refNumber: string; location: string; subject: string; message: string;
  extra: Record<string, string>; branchId: string | null; suggestedBranchId: string | null; matchedBy: string; matchedDocId: string; matchedDocType: string;
  status: string; lastActionAt: string; createdAt: string; history: ComplaintEvent[];
}

export const isOverdue = (c: Pick<Complaint, 'status' | 'lastActionAt'>, now = Date.now()) => OPEN_STATUSES.has(c.status) && now - new Date(c.lastActionAt).getTime() > OVERDUE_MS;

/**
 * Areas and other names of each branch city, to SUGGEST a branch from the location the customer typed
 * (the admin still decides). Keys are branch names/cities in lower case.
 */
export const AREA_HINTS: Record<string, string[]> = {
  pune: ['pune', 'pcmc', 'pimpri', 'chinchwad', 'hinjewadi', 'hinjawadi', 'wakad', 'baner', 'kharadi', 'hadapsar', 'kothrud', 'nigdi', 'akurdi', 'bhosari', 'viman nagar', 'wagholi', 'chakan', 'talegaon', 'magarpatta', 'aundh', 'katraj', 'pimple'],
  mumbai: ['mumbai', 'bombay', 'thane', 'navi mumbai', 'vashi', 'panvel', 'kharghar', 'bhiwandi', 'kalyan', 'dombivli', 'andheri', 'borivali', 'powai', 'malad', 'goregaon', 'chembur', 'kamothe', 'mira road', 'vasai', 'virar', 'belapur', 'nerul', 'airoli'],
  delhi: ['delhi', 'new delhi', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'ghaziabad', 'faridabad', 'dwarka', 'rohini', 'saket', 'janakpuri', 'laxmi nagar', 'vasant kunj'],
  bangalore: ['bangalore', 'bengaluru', 'whitefield', 'electronic city', 'marathahalli', 'koramangala', 'hsr layout', 'bellandur', 'banaswadi', 'yelahanka', 'hebbal', 'jayanagar', 'btm', 'sarjapur', 'indiranagar', 'kundalahalli'],
  hyderabad: ['hyderabad', 'secunderabad', 'gachibowli', 'hitech city', 'madhapur', 'kondapur', 'kukatpally', 'banjara hills', 'jubilee hills', 'manikonda', 'alwal', 'miyapur', 'lb nagar', 'uppal'],
  chennai: ['chennai', 'madras', 'tambaram', 'velachery', 'anna nagar', 'porur', 'omr', 'adyar', 'redhills', 'avadi', 'guindy'],
  kolkata: ['kolkata', 'calcutta', 'howrah', 'salt lake', 'new town', 'rajarhat', 'dum dum', 'dumdum', 'konnagar', 'barrackpore', 'behala', 'garia', 'serampore'],
  ahmedabad: ['ahmedabad', 'gandhinagar', 'lambha', 'naroda', 'maninagar', 'satellite', 'bopal', 'sg highway', 'chandkheda'],
  indore: ['indore', 'mangliya', 'vijay nagar', 'rau', 'dewas'],
  ranchi: ['ranchi', 'kadru', 'kanke', 'doranda', 'jamshedpur'],
  bhubaneswar: ['bhubaneswar', 'bhubaneshwar', 'cuttack', 'patia', 'infocity', 'khandagiri', 'nayapalli', 'chandrasekharpur'],
  visakhapatnam: ['visakhapatnam', 'vishakhapatnam', 'vizag', 'madhurwada', 'gajuwaka', 'mvp colony'],
  kochi: ['kochi', 'cochin', 'ernakulam', 'kakkanad', 'edappally', 'aluva'],
  agartala: ['agartala', 'tripura', 'gandhigram'],
  balasore: ['balasore', 'baleswar'],
  bhadrak: ['bhadrak'],
  durgapur: ['durgapur', 'asansol', 'bardhaman', 'burdwan'],
};

/** Branch names/cities in the CRM → the branch the location most likely belongs to (or null). */
export function suggestBranch(location: string, branches: { id: string; name: string; city: string }[]): string | null {
  const text = ` ${String(location ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')} `;
  if (!text.trim()) return null;
  let best: { id: string; len: number } | null = null;
  for (const b of branches) {
    const keys = new Set([b.name.toLowerCase(), b.city.toLowerCase(), ...(AREA_HINTS[b.name.toLowerCase()] ?? []), ...(AREA_HINTS[b.city.toLowerCase()] ?? [])].filter(Boolean));
    for (const k of keys) {
      if (text.includes(` ${k} `) && (!best || k.length > best.len)) best = { id: b.id, len: k.length };
    }
  }
  return best?.id ?? null;
}

/** "bil / del / 27-11-26 / 03 " → "BIL/DEL/27-11-26/03" (for matching bill, quotation and LR numbers). */
export const normNumber = (s: string) => String(s ?? '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9/\-_.]/g, '');
