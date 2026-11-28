'use client';
import { useEffect, useState } from 'react';

/** A text value remembered on this device (like the date range). */
export function useLocalState(key: string, fallback: string): [string, (v: string) => void] {
  const [v, setV] = useState(fallback);
  useEffect(() => {
    try { const s = localStorage.getItem(key); if (s !== null) setV(s.slice(0, 60)); } catch { /* ignore */ }
  }, [key]);
  const set = (next: string) => {
    setV(next);
    try { if (next) localStorage.setItem(key, next); else localStorage.removeItem(key); } catch { /* ignore */ }
  };
  return [v, set];
}
