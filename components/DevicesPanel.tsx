'use client';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Laptop, Loader2, LogOut, MapPin, ShieldAlert, Smartphone, Tablet } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/roles';
import { useConfirm } from './ui';

export interface Device { id: string; device: string; browser: string; os: string; ip: string; place: string; signedInAt: string; lastSeenAt: string; current: boolean }
export interface Account { id: string; name: string; loginId: string; role: string; active: boolean; branchId: string | null; sessions: Device[] }

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 6) return 'Active now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const Icon = ({ os }: { os: string }) => (/Android|iPhone/.test(os) ? <Smartphone size={18} /> : /iPad/.test(os) ? <Tablet size={18} /> : <Laptop size={18} />);

/** Loads every account's signed-in devices once (admin: ?branch=all, branch owner: their branch). */
export function useDevices(scope: 'all' | 'mine' | null) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!scope) return;
    try { setError(''); const r = await api<{ users: Account[] }>(`/api/sessions${scope === 'all' ? '?branch=all' : ''}`); setAccounts(r.users); }
    catch (e) { setError((e as Error).message); }
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  return { accounts, error, reload: load };
}

/** Accounts with their devices; "Sign out" per device and "Sign out all other devices" per account. */
export default function DevicesPanel({ accounts, reload, onMsg, title = 'Signed-in devices' }: { accounts: Account[]; reload: () => Promise<void>; onMsg: (m: string) => void; title?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [ask, confirmDialog] = useConfirm();
  const total = accounts.reduce((a, u) => a + u.sessions.length, 0);
  const many = accounts.some((u) => u.role !== 'team' && u.sessions.length > 2);

  const signOut = async (u: Account, d?: Device) => {
    const ok = await ask({
      tone: 'red', confirmLabel: d ? 'Yes, sign out' : 'Yes, sign out all',
      title: d ? 'Sign out this device?' : `Sign out all devices of ${u.name}?`,
      message: d
        ? <p><b>{d.device}</b> ({d.browser}{d.place ? `, ${d.place}` : ''}) will be signed out of <b>{u.loginId}</b> at once.{d.current ? ' This is the device you are using now.' : ''}</p>
        : <p>Every phone and computer signed in as <b>{u.loginId}</b> is signed out at once (except this one, if it is yours). If you think someone else knows the password, also use <b>Reset password</b> in Users.</p>,
    });
    if (!ok) return;
    setBusy(d?.id ?? u.id);
    try { const r = await api<{ ended: number }>('/api/sessions/revoke', { body: { userId: u.id, ...(d ? { sessionId: d.id } : {}) } }); onMsg(`${r.ended} device${r.ended === 1 ? '' : 's'} signed out`); await reload(); }
    catch (e) { onMsg((e as Error).message); }
    setBusy('');
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm">
        <Smartphone size={16} className="text-brand-700" />
        <span className="flex-1 font-semibold text-slate-800">{title}</span>
        {many && <ShieldAlert size={15} className="text-amber-600" aria-label="Many devices" />}
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${total ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{total} active</span>
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 p-3">
          {!accounts.length && <p className="text-xs text-slate-500">No accounts in this branch yet.</p>}
          {accounts.map((u) => (
            <div key={u.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm"><b className="text-slate-900">{u.name}</b> <span className="text-xs text-slate-500">· {u.loginId} · {ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}{u.active ? '' : ' · switched off'}</span></p>
                <span className="text-xs font-semibold text-slate-600">{u.sessions.length} device{u.sessions.length === 1 ? '' : 's'}</span>
                {u.sessions.length > 0 && <button disabled={busy === u.id} onClick={() => signOut(u)} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Sign out all</button>}
              </div>
              {u.sessions.length === 0 ? <p className="pl-1 text-xs text-slate-400">Not signed in anywhere</p> : (
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {u.sessions.map((d) => (
                    <li key={d.id} className="flex items-start gap-2.5 px-2.5 py-2">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon os={d.os} /></span>
                      <div className="min-w-0 flex-1 text-xs leading-snug">
                        <p className="truncate font-semibold text-slate-900">{d.device} · {d.browser}{d.current && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">This device</span>}</p>
                        <p className="flex flex-wrap items-center gap-x-1 text-slate-500"><MapPin size={11} />{d.place || 'Location unknown'}{d.ip ? ` · IP ${d.ip}` : ''}</p>
                        <p className="text-slate-500"><span className={ago(d.lastSeenAt) === 'Active now' ? 'font-semibold text-emerald-700' : ''}>{ago(d.lastSeenAt)}</span> · signed in {when(d.signedInAt)}</p>
                      </div>
                      <button disabled={busy === d.id} onClick={() => signOut(u, d)} aria-label="Sign out this device" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-red-600 hover:bg-red-50">{busy === d.id ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-[11px] text-slate-500">A device you don&apos;t recognise? Sign it out, then reset the password in Users. Places come from the internet connection and can be approximate.</p>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
