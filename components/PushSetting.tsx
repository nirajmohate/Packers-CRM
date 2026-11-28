'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { todayISO } from '@/lib/format';

type State = 'loading' | 'unsupported' | 'not-configured' | 'blocked' | 'off' | 'on';

const toKey = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing ?? navigator.serviceWorker.register('/sw.js');
}

/** Phone notifications on/off for this device. variant 'banner' = dashboard nudge (only while off), 'row' = account menu. */
export default function PushSetting({ variant }: { variant: 'banner' | 'row' }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [hidden, setHidden] = useState(false);

  const check = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('unsupported'); return; }
    try {
      const info = await api<{ configured: boolean }>('/api/push');
      if (!info.configured) { setState('not-configured'); return; }
      if (Notification.permission === 'denied') { setState('blocked'); return; }
      const reg = await registration();
      setState((await reg.pushManager.getSubscription()) ? 'on' : 'off');
    } catch {
      setState('unsupported');
    }
  }, []);
  useEffect(() => {
    void check();
    try { if (variant === 'banner' && localStorage.getItem('pm_push_later') === todayISO()) setHidden(true); } catch { /* ignore */ }
  }, [check, variant]);

  const turnOn = async () => {
    setBusy(true); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const { publicKey } = await api<{ publicKey: string }>('/api/push');
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      await api('/api/push', { method: 'POST', body: sub.toJSON() });
      setState('on');
      setMsg('Notifications are on. You will get packing reminders and complaints waiting over 48 hours.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not turn on notifications');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true); setMsg('');
    try {
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) { await api('/api/push', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined); await sub.unsubscribe(); }
      setState('off');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true); setMsg('');
    try {
      await api('/api/push/test', { method: 'POST' });
      setMsg('Test sent. It should appear on this phone in a few seconds.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'banner') {
    if (hidden || (state !== 'off' && !(state === 'on' && msg))) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 sm:p-4">
        <BellRing className="shrink-0 text-brand-700" size={22} />
        <p className="min-w-0 flex-1 text-sm text-brand-900">
          {state === 'on' ? msg : <><b>Get phone notifications</b> for upcoming packing and complaints waiting over 48 hours.</>}
        </p>
        {state === 'off' && (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost min-h-[40px]" onClick={() => { setHidden(true); try { localStorage.setItem('pm_push_later', todayISO()); } catch { /* ignore */ } }}>Later</button>
            <button type="button" className="btn-primary min-h-[40px]" disabled={busy} onClick={turnOn}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}Turn on</button>
          </div>
        )}
        {state === 'on' && <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-brand-100" onClick={() => setHidden(true)} aria-label="Close"><X size={16} /></button>}
        {msg && state !== 'on' && <p className="w-full text-xs font-medium text-red-700">{msg}</p>}
      </div>
    );
  }

  // account menu row
  if (state === 'loading' || state === 'unsupported') return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        {state === 'on' ? <BellRing size={18} className="text-emerald-600" /> : <BellOff size={18} className="text-slate-500" />}
        <p className="flex-1 text-sm font-semibold text-slate-800">Phone notifications: {state === 'on' ? 'On' : 'Off'}</p>
        {state === 'on' && <button type="button" className="btn-ghost min-h-[36px] px-3 text-xs" disabled={busy} onClick={test}>Send test</button>}
        {state === 'on' && <button type="button" className="btn-ghost min-h-[36px] px-3 text-xs" disabled={busy} onClick={turnOff}>Turn off</button>}
        {state === 'off' && <button type="button" className="btn-primary min-h-[36px] px-3 text-xs" disabled={busy} onClick={turnOn}>Turn on</button>}
      </div>
      {state === 'blocked' && <p className="mt-1.5 text-xs text-amber-800">Notifications are blocked for this app. Open phone Settings → Apps → Cloud Packers (or Chrome) → Notifications → Allow, then come back.</p>}
      {state === 'not-configured' && <p className="mt-1.5 text-xs text-slate-500">Not set up on the server yet.</p>}
      {msg && <p className="mt-1.5 text-xs text-slate-600">{msg}</p>}
    </div>
  );
}
