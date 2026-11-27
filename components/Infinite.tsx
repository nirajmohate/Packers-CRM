'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

/**
 * Shows `step` rows first and adds `step` more each time the user scrolls near the end of the list.
 * `resetKey` changes when the search or filters change, so the list starts again from the top.
 * Returns how many rows to show and a ref for the invisible marker placed after the last row.
 */
export function useInfinite(total: number, resetKey: string, step = 10): [number, (el: HTMLElement | null) => void, () => void] {
  const [count, setCount] = useState(step);
  useEffect(() => setCount(step), [resetKey, step]);
  const obs = useRef<IntersectionObserver | null>(null);
  // a new observer after every page, so a short page that still shows the marker loads the next one too
  const sentinel = useCallback((el: HTMLElement | null) => {
    obs.current?.disconnect();
    obs.current = null;
    if (!el || count >= total || typeof IntersectionObserver === 'undefined') return;
    obs.current = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + step, total));
    }, { rootMargin: '300px 0px' });
    obs.current.observe(el);
  }, [count, total, step]);
  useEffect(() => () => obs.current?.disconnect(), []);
  const more = useCallback(() => setCount((c) => Math.min(c + step, total)), [step, total]);
  return [Math.min(count, total), sentinel, more];
}

/** Small counter fixed on the right side of the screen: how many are shown and how many are still to come. */
export function LoadCounter({ shown, total }: { shown: number; total: number }) {
  // once everything is shown the list itself says so; the floating counter goes away so it never covers a row
  if (total <= 0 || shown >= total) return null;
  const left = Math.max(total - shown, 0);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-[5.25rem] right-3 z-30 rounded-2xl bg-slate-900/85 px-3 py-1.5 text-right text-[11px] font-semibold leading-tight text-white shadow-lg lg:bottom-8 lg:right-6">
      <span className="block">{shown} / {total} <span className="font-normal text-white/80">loaded</span></span>
      <span className={`block ${left ? 'text-amber-300' : 'text-emerald-300'}`}>{left ? `${left} left` : 'All loaded'}</span>
    </div>
  );
}

/** Goes after the last row: loads more when it comes into view, or says everything is shown. */
export function LoadMore({ shown, total, sentinel, more }: { shown: number; total: number; sentinel: (el: HTMLElement | null) => void; more: () => void }) {
  if (total === 0) return null;
  if (shown >= total)
    return <p className="flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />All {total} shown</p>;
  return (
    <div ref={sentinel} className="flex flex-col items-center gap-2 py-4 text-xs text-slate-500">
      <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Loading more… ({total - shown} left)</span>
      {/* fallback for old browsers without automatic loading */}
      <button type="button" onClick={more} className="text-brand-700 underline">Show more</button>
    </div>
  );
}
