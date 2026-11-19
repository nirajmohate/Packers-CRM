'use client';
import { useEffect } from 'react';

/** Production: registers the small install/offline-page worker. Development: removes any worker left over from an earlier version. */
export default function RegisterSW() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      if ('caches' in window) caches.keys().then((ks) => ks.filter((k) => k.startsWith('pm-')).forEach((k) => caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
