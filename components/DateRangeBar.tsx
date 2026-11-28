'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { fmtDate, todayISO } from '@/lib/format';
import { fyOf } from '@/lib/numbering';

export type RangeKey = 'today' | '7d' | '28d' | '3m' | '6m' | '12m' | '16m' | 'fy' | 'lastfy' | 'all' | 'custom';
export interface DateRange { key: RangeKey; from: string; to: string; label: string }

const MAIN: [RangeKey, string][] = [['today', 'Today'], ['7d', '7 days'], ['28d', '28 days'], ['3m', '3 months']];
/** The list in the "More" dialog, like the Search Console date filter. */
const ALL: [RangeKey, string][] = [
  ['today', 'Today'], ['7d', 'Last 7 days'], ['28d', 'Last 28 days'], ['3m', 'Last 3 months'], ['6m', 'Last 6 months'],
  ['12m', 'Last 12 months'], ['16m', 'Last 16 months'], ['fy', 'This financial year'], ['lastfy', 'Last financial year'], ['all', 'All time'], ['custom', 'Custom'],
];
const LABEL: Record<RangeKey, string> = Object.fromEntries(ALL) as Record<RangeKey, string>;
const IN_MAIN = new Set(MAIN.map(([k]) => k));

const shift = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return todayISO(d); };
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The dates a choice covers (both ends included). */
export function rangeFor(key: RangeKey, customFrom = '', customTo = ''): DateRange {
  const today = todayISO();
  const fyStart = Number(fyOf(today).slice(0, 4));
  switch (key) {
    case 'today': return { key, from: today, to: today, label: 'Today' };
    case '7d': return { key, from: shift(6), to: today, label: 'Last 7 days' };
    case '28d': return { key, from: shift(27), to: today, label: 'Last 28 days' };
    case '3m': return { key, from: shift(90), to: today, label: 'Last 3 months' };
    case '6m': return { key, from: shift(182), to: today, label: 'Last 6 months' };
    case '12m': return { key, from: shift(364), to: today, label: 'Last 12 months' };
    case '16m': return { key, from: shift(486), to: today, label: 'Last 16 months' };
    case 'fy': return { key, from: `${fyStart}-04-01`, to: `${fyStart + 1}-03-31`, label: `Financial year ${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}` };
    case 'lastfy': return { key, from: `${fyStart - 1}-04-01`, to: `${fyStart}-03-31`, label: `Financial year ${fyStart - 1}-${String(fyStart % 100).padStart(2, '0')}` };
    case 'all': return { key, from: '2000-01-01', to: '2100-12-31', label: 'All time' };
    case 'custom': {
      let f = isDate(customFrom) ? customFrom : shift(27);
      let t = isDate(customTo) ? customTo : today;
      if (f > t) [f, t] = [t, f];
      return { key, from: f, to: t, label: `${fmtDate(f)} – ${fmtDate(t)}` };
    }
  }
}

/** Remembers the choice on this device (like Search Console keeps your last period). */
export function useDateRange(storageKey: string, fallback: RangeKey = '28d'): [DateRange, (k: RangeKey, from?: string, to?: string) => void] {
  const [r, setR] = useState<DateRange>(() => rangeFor(fallback));
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (v && typeof v.key === 'string' && v.key in LABEL) setR(rangeFor(v.key as RangeKey, v.from, v.to));
    } catch { /* ignore */ }
  }, [storageKey]);
  const set = (k: RangeKey, from?: string, to?: string) => {
    const next = rangeFor(k, from, to);
    setR(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ key: k, from: next.from, to: next.to })); } catch { /* ignore */ }
  };
  return [r, set];
}

/** Optional city filter shown above the dates in the dialog ('' = all, 'city:Pune'). */
export interface CityFilter { cities: string[]; value: string; onChange: (v: string) => void }
export const cityFilterLabel = (v: string) => (v.startsWith('city:') ? v.slice(5) : v.startsWith('text:') ? `“${v.slice(5)}”` : '');

export default function DateRangeBar({ range, onChange, city }: { range: DateRange; onChange: (k: RangeKey, from?: string, to?: string) => void; city?: CityFilter }) {
  const [open, setOpen] = useState(false);
  const [cityPick, setCityPick] = useState('');
  const [pick, setPick] = useState<RangeKey>(range.key);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const dialog = useRef<HTMLDivElement>(null);

  const show = () => {
    setPick(range.key);
    setFrom(range.from > '2000-01-01' ? range.from : shiftDays(27));
    setTo(range.to < '2100-01-01' ? range.to : todayISO());
    const v = city?.value ?? '';
    setCityPick(v.startsWith('city:') ? v : '');
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    dialog.current?.querySelector<HTMLInputElement>('input[type=radio]:checked')?.focus();
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const customBad = pick === 'custom' && (!from || !to || from > to);
  const apply = () => {
    if (customBad) return;
    onChange(pick, from, to);
    if (city) city.onChange(cityPick);
    setOpen(false);
  };
  const inMore = !IN_MAIN.has(range.key);
  const btn = (on: boolean) => `flex items-center gap-1 whitespace-nowrap px-2 py-2 text-xs font-medium min-[380px]:px-2.5 min-[380px]:text-[13px] sm:gap-1.5 sm:px-3.5 sm:text-sm ${on ? 'bg-brand-100 text-brand-800' : 'bg-white text-slate-700 hover:bg-slate-50'}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-xl border border-slate-300 shadow-sm">
        {MAIN.map(([k, l], i) => (
          <button key={k} type="button" onClick={() => onChange(k)} className={`${btn(range.key === k)} ${i ? 'border-l border-slate-300' : ''}`}>
            {range.key === k && <Check size={14} className="hidden sm:block" />}{l}
          </button>
        ))}
        <button type="button" onClick={show} aria-haspopup="dialog" className={`${btn(inMore)} border-l border-slate-300`}>
          {inMore && <Check size={14} className="hidden sm:block" />}{inMore && range.key !== 'custom' ? LABEL[range.key] : inMore ? 'Custom' : 'More'}<ChevronDown size={15} />
        </button>
      </div>
      <span className="text-xs font-medium text-slate-500">{range.label}</span>
      {city?.value && (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
          City: {cityFilterLabel(city.value)}
          <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-brand-100" onClick={() => city.onChange('')} aria-label="Remove city filter"><X size={13} /></button>
        </span>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dr-title"
            className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 pb-0 pt-4">
              <h2 id="dr-title" className="text-lg font-semibold text-slate-900">{city ? 'Filters' : 'Date range'}</h2>
              {!city && <div className="mt-3 flex"><span className="border-b-2 border-brand-600 px-1 pb-2 text-sm font-semibold uppercase tracking-wide text-brand-700">Filter</span></div>}
              {city && <div className="h-3" />}
            </div>
            <div className="flex-1 overflow-y-auto">
            {city && (
              <div className="border-b border-slate-200 px-5 py-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="dr-city">City</label>
                <select id="dr-city" className="input mt-1.5" value={cityPick} onChange={(e) => setCityPick(e.target.value)}>
                  <option value="">All cities ({city.cities.length})</option>
                  {city.cities.map((c) => <option key={c} value={`city:${c}`}>{c}</option>)}
                </select>
              </div>
            )}
            {city && <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date</p>}
            <fieldset className="px-2 py-2">
              <legend className="sr-only">Choose the dates to show</legend>
              {ALL.map(([k, l]) => (
                <div key={k}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] ${pick === k ? 'text-brand-800' : 'text-slate-700'} hover:bg-slate-50`}>
                    <input type="radio" name="date-range" value={k} checked={pick === k} onChange={() => setPick(k)} className="h-[18px] w-[18px] accent-brand-600" />
                    <span className={pick === k ? 'font-semibold' : ''}>{l}</span>
                    {k !== 'custom' && k !== 'all' && <span className="ml-auto text-xs text-slate-400">{rangeLabelShort(k)}</span>}
                  </label>
                  {k === 'custom' && pick === 'custom' && (
                    <div className="grid grid-cols-2 gap-3 px-3 pb-2 pl-10">
                      <label className="text-xs font-medium text-slate-600">Start date
                        <input type="date" className="input mt-1 min-h-[40px] py-1.5" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                      </label>
                      <label className="text-xs font-medium text-slate-600">End date
                        <input type="date" className="input mt-1 min-h-[40px] py-1.5" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                      </label>
                      {customBad && <p className="col-span-2 text-xs font-medium text-red-600">Choose a start date that is on or before the end date.</p>}
                    </div>
                  )}
                </div>
              ))}
            </fieldset>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" className="btn-ghost min-h-[40px]" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary min-h-[40px]" disabled={customBad} onClick={apply}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const shiftDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return todayISO(d); };
/** Small grey dates next to each choice, e.g. "22 Nov – 28 Nov". */
function rangeLabelShort(k: RangeKey) {
  const r = rangeFor(k);
  return r.from === r.to ? fmtDate(r.from) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
}
