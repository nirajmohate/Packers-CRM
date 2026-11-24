'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { fmtDate, todayISO } from '@/lib/format';
import { fyOf } from '@/lib/numbering';

export type RangeKey = 'today' | '7d' | '28d' | '3m' | '12m' | 'fy' | 'lastfy' | 'all' | 'custom';
export interface DateRange { key: RangeKey; from: string; to: string; label: string }

const MAIN: [RangeKey, string][] = [['today', 'Today'], ['7d', '7 days'], ['28d', '28 days'], ['3m', '3 months']];
const MORE: [RangeKey, string][] = [['12m', '12 months'], ['fy', 'This financial year'], ['lastfy', 'Last financial year'], ['all', 'All time'], ['custom', 'Custom dates']];
const LABEL: Record<RangeKey, string> = Object.fromEntries([...MAIN, ...MORE]) as Record<RangeKey, string>;

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
    case '12m': return { key, from: shift(364), to: today, label: 'Last 12 months' };
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

export default function DateRangeBar({ range, onChange }: { range: DateRange; onChange: (k: RangeKey, from?: string, to?: string) => void }) {
  const [more, setMore] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMore(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [more]);
  const inMore = MORE.some(([k]) => k === range.key);
  const btn = (on: boolean) => `flex items-center gap-1 whitespace-nowrap px-2 py-2 text-xs font-medium min-[380px]:px-2.5 min-[380px]:text-[13px] sm:gap-1.5 sm:px-3.5 sm:text-sm ${on ? 'bg-brand-100 text-brand-800' : 'bg-white text-slate-700 hover:bg-slate-50'}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-300 shadow-sm">
          {MAIN.map(([k, l], i) => (
            <button key={k} type="button" onClick={() => { onChange(k); setCustom(false); }} className={`${btn(range.key === k)} ${i ? 'border-l border-slate-300' : ''}`}>
              {range.key === k && <Check size={14} className="hidden sm:block" />}{l}
            </button>
          ))}
          <div ref={box} className="relative border-l border-slate-300">
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className={btn(inMore)}>
              {inMore && <Check size={15} />}{inMore ? LABEL[range.key] : 'More'}<ChevronDown size={15} />
            </button>
            {more && (
              <ul className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                {MORE.map(([k, l]) => (
                  <li key={k}>
                    <button type="button" className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${range.key === k ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-700 hover:bg-slate-50'}`}
                      onClick={() => { setMore(false); if (k === 'custom') { setCustom(true); setFrom(range.from > '2000-01-01' ? range.from : todayISO()); setTo(range.to < '2100-01-01' ? range.to : todayISO()); } else { setCustom(false); onChange(k); } }}>
                      {l}{range.key === k && <Check size={15} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500">{range.label}</span>
      </div>
      {custom && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <label className="text-xs font-medium text-slate-600">From<input type="date" className="input mt-1 min-h-[40px] py-1.5" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs font-medium text-slate-600">To<input type="date" className="input mt-1 min-h-[40px] py-1.5" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="btn-primary min-h-[40px]" onClick={() => { onChange('custom', from, to); setCustom(false); }}>Apply</button>
          <button type="button" className="btn-ghost min-h-[40px]" onClick={() => setCustom(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
