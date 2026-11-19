'use client';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiFail, useBranches, useSession } from '@/lib/store';
import { fmtDate } from '@/lib/format';
import { Sheet, Toast } from '@/components/ui';

interface U { id: string; name: string; loginId: string; role: 'admin' | 'manager'; branchId: string | null; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; locked: boolean }

export default function Users() {
  const me = useSession();
  const branches = useBranches();
  const [users, setUsers] = useState<U[] | null>(null);
  const [form, setForm] = useState<{ id?: string; name: string; loginId: string; role: 'admin' | 'manager'; branchId: string; password: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ who: string; pw: string } | null>(null);
  const [toast, setToast] = useState('');
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(() => api<{ users: U[] }>('/api/users').then((r) => setUsers(r.users)).catch((e) => say(e instanceof ApiFail ? e.message : 'Could not load users')), []);
  useEffect(() => { load(); }, [load]);
  if (me && me.role !== 'admin') return <p className="py-10 text-center text-slate-500">Only the admin can manage users.</p>;

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '-';
  const open = (u?: U) => { setErrs({}); setMsg(''); setForm(u ? { id: u.id, name: u.name, loginId: u.loginId, role: u.role, branchId: u.branchId ?? '', password: '' } : { name: '', loginId: '', role: 'manager', branchId: '', password: '' }); };

  const save = async () => {
    if (!form) return;
    setBusy(true); setErrs({}); setMsg('');
    try {
      if (form.id) {
        await api(`/api/users/${form.id}`, { method: 'PATCH', body: { name: form.name, role: form.role, branchId: form.role === 'manager' ? form.branchId : null } });
        say('User updated');
      } else {
        const r = await api<{ tempPassword: string | null }>('/api/users', { body: { name: form.name, loginId: form.loginId, role: form.role, branchId: form.role === 'manager' ? form.branchId : null, ...(form.password ? { password: form.password } : {}) } });
        if (r.tempPassword) setTemp({ who: form.loginId, pw: r.tempPassword });
        else say('User created. They must choose a new password at first sign-in.');
      }
      setForm(null); await load();
    } catch (e) { if (e instanceof ApiFail) { setErrs(e.fields ?? {}); setMsg(e.message); } else setMsg('Could not save'); }
    setBusy(false);
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); say(ok); await load(); } catch (e) { say(e instanceof ApiFail ? e.message : 'Something went wrong'); } };
  const reset = async (u: U) => {
    if (!window.confirm(`Reset the password for ${u.name}? They will be signed out and must choose a new password.`)) return;
    try { const r = await api<{ tempPassword: string }>(`/api/users/${u.id}/reset-password`, { body: {} }); setTemp({ who: u.loginId, pw: r.tempPassword }); await load(); }
    catch (e) { say(e instanceof ApiFail ? e.message : 'Could not reset'); }
  };
  const err = (k: string) => errs[k] && <p className="mt-1 text-xs text-red-600">{errs[k]}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">Users</h1><p className="text-xs text-slate-500">One admin and a manager for each branch</p></div>
        <button className="btn-primary" onClick={() => open()}><Plus size={17} />Add user</button>
      </div>
      {!users ? <p className="py-8 text-center text-sm text-slate-400">Loading…</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {users.map((u) => (
            <li key={u.id} className={`card space-y-3 p-4 ${u.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${u.role === 'admin' ? 'bg-violet-50 text-violet-700' : 'bg-brand-50 text-brand-700'}`}>{u.role === 'admin' ? <ShieldCheck size={19} /> : <UserRound size={19} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{u.name}{u.id === me?.id ? ' (you)' : ''}</p>
                  <p className="truncate text-xs text-slate-500">{u.loginId} · {u.role === 'admin' ? 'Admin, all branches' : branchName(u.branchId)}</p>
                  <p className="text-xs text-slate-400">{u.lastLoginAt ? `Last sign-in ${fmtDate(u.lastLoginAt)}` : 'Never signed in'}{u.mustChangePassword ? ' · must change password' : ''}</p>
                  <p className="mt-1 flex gap-1.5">{!u.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Inactive</span>}{u.locked && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Locked</span>}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost min-h-[40px]" onClick={() => open(u)}>Edit</button>
                <button className="btn-ghost min-h-[40px]" onClick={() => reset(u)}><KeyRound size={15} />Reset password</button>
                {u.locked && <button className="btn-ghost min-h-[40px]" onClick={() => act(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { unlock: true } }), 'Unlocked')}>Unlock</button>}
                {u.id !== me?.id && <button className={u.active ? 'btn-danger min-h-[40px]' : 'btn-ghost min-h-[40px]'} onClick={() => act(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), u.active ? 'Deactivated' : 'Activated')}>{u.active ? 'Deactivate' : 'Activate'}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit user' : 'New user'}>
        {form && (
          <div className="space-y-3">
            <div><label className="label">Full name</label><input className={`input ${errs.name ? 'border-red-400' : ''}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />{err('name')}</div>
            <div><label className="label">Login ID</label><input className={`input ${errs.loginId ? 'border-red-400' : ''}`} value={form.loginId} disabled={!!form.id} autoCapitalize="none" onChange={(e) => setForm({ ...form, loginId: e.target.value })} />{err('loginId')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Role</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'manager' })} disabled={form.id === me?.id}><option value="manager">Branch manager</option><option value="admin">Admin</option></select></div>
              {form.role === 'manager' && <div><label className="label">Branch</label><select className={`input ${errs.branchId ? 'border-red-400' : ''}`} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}><option value="">Choose</option>{branches.filter((b) => b.active !== false).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{err('branchId')}</div>}
            </div>
            {!form.id && <div><label className="label">Password (optional)</label><input className={`input ${errs.password ? 'border-red-400' : ''}`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave empty to generate one" />{err('password')}</div>}
            {msg && !Object.keys(errs).length && <p className="text-sm text-red-600">{msg}</p>}
            <p className="text-xs text-slate-500">{form.id ? 'Changing the branch or role signs the person out.' : 'The person must choose a new password the first time they sign in.'}</p>
            <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save user'}</button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!temp} onClose={() => setTemp(null)} title="Temporary password">
        {temp && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Give this to <b>{temp.who}</b>. It is shown only once, and they must change it when they sign in.</p>
            <p className="select-all rounded-xl bg-slate-100 p-4 text-center font-mono text-xl font-bold tracking-wider text-slate-900">{temp.pw}</p>
            <button className="btn-ghost w-full" onClick={() => { navigator.clipboard?.writeText(temp.pw).then(() => say('Copied')).catch(() => {}); }}>Copy</button>
            <button className="btn-primary w-full" onClick={() => setTemp(null)}>Done</button>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} />
    </div>
  );
}
