'use client';
import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

interface Alert { id: string; userName: string; loginId: string; device: string; place: string; ip: string; at: string }

/** Admin dashboard: "New sign-in on an admin account — was this you?" */
export default function SecurityAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const load = useCallback(async () => { try { setAlerts((await api<{ alerts: Alert[] }>('/api/alerts')).alerts); } catch { /* not shown */ } }, []);
  useEffect(() => { void load(); }, [load]);
  const answer = async (a: Alert, ans: 'me' | 'not-me') => {
    setBusy(a.id);
    try {
      await api('/api/alerts', { body: { id: a.id, answer: ans } });
      if (ans === 'not-me') setNote(`That device was signed out. Now change the password of "${a.loginId}" (Users → Change password) and turn on two-step login (Security).`);
      await load();
    } catch (e) { setNote((e as Error).message); }
    setBusy('');
  };
  if (!alerts.length && !note) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className="rounded-2xl border-2 border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-2 font-semibold text-red-800"><ShieldAlert size={18} />New sign-in to admin account <span className="font-mono">{a.loginId}</span></p>
          <p className="mt-1 text-sm text-red-900">{a.device}{a.place ? ` · ${a.place}` : ''}{a.ip ? ` · IP ${a.ip}` : ''} · {new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
          <p className="mt-1 text-sm font-semibold text-red-900">Was this you?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button disabled={busy === a.id} onClick={() => answer(a, 'me')} className="btn bg-white text-slate-800 ring-1 ring-slate-300">Yes, it was me</button>
            <button disabled={busy === a.id} onClick={() => answer(a, 'not-me')} className="btn bg-red-600 text-white hover:bg-red-700">No, sign it out</button>
          </div>
        </div>
      ))}
      {note && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{note} <button className="ml-1 underline" onClick={() => setNote('')}>OK</button></p>}
    </div>
  );
}
