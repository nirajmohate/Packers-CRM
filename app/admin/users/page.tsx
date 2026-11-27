'use client';
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Plus, ShieldCheck, UserRound, Users as UsersIcon } from 'lucide-react';
import { ROLE_LABEL, TEAM_TYPES, type Role } from '@/lib/roles';
import DevicesPanel, { useDevices } from '@/components/DevicesPanel';
import { BY_SLUG } from '@/lib/config';
import { api } from '@/lib/api';
import { ApiFail, useBranches, useSession } from '@/lib/store';
import { fmtDate } from '@/lib/format';
import { Sheet, Toast } from '@/components/ui';

interface U { id: string; name: string; loginId: string; role: Role; branchId: string | null; active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; locked: boolean }

export default function Users() {
  const me = useSession();
  const branches = useBranches();
  const [users, setUsers] = useState<U[] | null>(null);
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const devices = useDevices(me && me.role === 'manager' ? 'mine' : null);
  const [form, setForm] = useState<{ id?: string; name: string; loginId: string; role: Role; branchId: string; password: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // the login details just saved, shown once so the admin can copy and send them exactly
  const [temp, setTemp] = useState<{ who: string; pw: string; team?: boolean } | null>(null);
  const [pwFor, setPwFor] = useState<U | null>(null);
  const [pw, setPw] = useState({ a: '', b: '', show: false });
  const [toast, setToast] = useState('');
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const load = useCallback(() => api<{ users: U[] }>('/api/users').then((r) => setUsers(r.users)).catch((e) => say(e instanceof ApiFail ? e.message : 'Could not load users')), []);
  useEffect(() => { load(); }, [load]);
  if (me && me.role === 'team') return <p className="py-10 text-center text-slate-500">Your account cannot manage users.</p>;
  const admin = me?.role === 'admin';
  // a branch owner manages only the Team account of their branch (one per branch)

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '-';
  const open = (u?: U) => { setErrs({}); setMsg(''); setPw({ a: '', b: '', show: false }); setForm(u ? { id: u.id, name: u.name, loginId: u.loginId, role: u.role, branchId: u.branchId ?? '', password: '' } : admin ? { name: '', loginId: '', role: 'manager', branchId: '', password: '' } : { name: `${branchName(me?.branchId ?? null)} team`, loginId: '', role: 'team', branchId: me?.branchId ?? '', password: '' }); };
  // a branch owner manages their branch's one Team account (create, edit, password, on/off)
  const hasTeam = !admin && !!users?.some((u) => u.role === 'team');
  /** same rules as the server, checked here first so mistakes show at once */
  const pwProblem = (a: string, b: string, loginId: string): Record<string, string> | null => {
    if (!a) return { a: 'Type a password' };
    if (a !== a.trim()) return { a: 'No space at the start or end' };
    if (a.length < 8) return { a: 'At least 8 characters' };
    if (!/[A-Za-z]/.test(a) || !/\d/.test(a)) return { a: 'Use at least one letter and one number' };
    if (loginId && a.toLowerCase() === loginId.trim().toLowerCase()) return { a: 'Must not be the same as the login ID' };
    if (a !== b) return { b: 'The two passwords are not the same' };
    return null;
  };
  const pwBoxes = (loginId: string) => (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <label className="label" htmlFor="pw-a">Password</label>
        <div className="relative">
          <input id="pw-a" className={`input pr-11 font-mono ${errs.password || errs.a ? 'border-red-400' : ''}`} type={pw.show ? 'text' : 'password'} value={pw.a} maxLength={100}
            autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
          <button type="button" onClick={() => setPw({ ...pw, show: !pw.show })} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500" aria-label={pw.show ? 'Hide password' : 'Show password'}>{pw.show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </div>
        {err('a')}{err('password')}
      </div>
      <div>
        <label className="label" htmlFor="pw-b">Password again</label>
        <input id="pw-b" className={`input font-mono ${errs.b ? 'border-red-400' : ''}`} type={pw.show ? 'text' : 'password'} value={pw.b} maxLength={100}
          autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
        {err('b')}
      </div>
      <p className="text-[11px] text-slate-500">At least 8 characters with a letter and a number. Capital and small letters count{loginId ? `; it cannot be "${loginId}"` : ''}. The user signs in with exactly this password and cannot change it.</p>
    </div>
  );
  const needsBranch = (role: Role) => role === 'manager' || role === 'team';

  const save = async () => {
    if (!form) return;
    setBusy(true); setErrs({}); setMsg('');
    try {
      if (form.id) {
        await api(`/api/users/${form.id}`, { method: 'PATCH', body: admin ? { name: form.name, role: form.role, branchId: needsBranch(form.role) ? form.branchId : null } : { name: form.name } });
        say('User updated');
      } else {
        const bad = pwProblem(pw.a, pw.b, form.loginId);
        if (bad) { setErrs(bad); setBusy(false); return; }
        const loginId = form.loginId.trim().toLowerCase();
        await api('/api/users', { body: { name: form.name, loginId, role: form.role, branchId: needsBranch(form.role) ? form.branchId : null, password: pw.a } });
        setTemp({ who: loginId, pw: pw.a, team: form.role === 'team' });
      }
      setForm(null); await load();
    } catch (e) { if (e instanceof ApiFail) { setErrs(e.fields ?? {}); setMsg(e.message); } else setMsg('Could not save'); }
    setBusy(false);
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); say(ok); await load(); } catch (e) { say(e instanceof ApiFail ? e.message : 'Something went wrong'); } };
  const reset = (u: U) => { setErrs({}); setMsg(''); setPw({ a: '', b: '', show: false }); setPwFor(u); };
  const savePassword = async () => {
    if (!pwFor) return;
    const bad = pwProblem(pw.a, pw.b, pwFor.loginId);
    if (bad) { setErrs(bad); return; }
    setBusy(true); setErrs({}); setMsg('');
    try {
      await api(`/api/users/${pwFor.id}/reset-password`, { body: { password: pw.a } });
      setTemp({ who: pwFor.loginId, pw: pw.a, team: pwFor.role === 'team' }); setPwFor(null); await load();
    } catch (e) { if (e instanceof ApiFail) { setErrs(e.fields ?? {}); setMsg(e.message); } else setMsg('Could not change the password'); }
    setBusy(false);
  };
  const err = (k: string) => errs[k] && <p className="mt-1 text-xs text-red-600">{errs[k]}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{admin ? 'Users' : 'My team'}</h1>
          <p className="text-xs text-slate-500">{admin ? 'You create every account and set its password. Users only sign in; they cannot change their own password.' : `The Team account of ${branchName(me?.branchId ?? null)}: one login your executives share, on as many phones as needed. You set its password.`}</p>
        </div>
        {(admin || !hasTeam) && <button className="btn-primary" onClick={() => open()}><Plus size={17} />{admin ? 'Add user' : 'Create Team account'}</button>}
      </div>
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
        <p className="flex items-center gap-1.5 font-semibold"><UsersIcon size={15} />What the Team account can do</p>
        <p className="mt-1">Make, edit and change the status of {TEAM_TYPES.map((t) => BY_SLUG[t]?.title).filter(Boolean).join(', ')} in its own branch. It can add and pick customers (needed before a quotation), but cannot delete, and cannot see bills, payments, reports or settings. Everything it saves is in the branch, so the branch owner and the admin see it too. Its sign-ins are in the audit log with the phone and network used.</p>
      </div>
      {admin && users && (() => {
        // admin: every branch should have a Team account; create the missing ones from here
        const missing = branches.filter((b) => b.active !== false && !users.some((u) => u.role === 'team' && u.branchId === b.id));
        return (
          <div className="space-y-2">
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
              {([['', 'All'], ['admin', 'Admin'], ['manager', 'Branch owners'], ['team', 'Team accounts']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setRoleFilter(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${roleFilter === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'}`}>
                  {l} {k ? users.filter((u) => u.role === k).length : users.length}
                </button>
              ))}
            </div>
            {missing.length > 0 && (roleFilter === '' || roleFilter === 'team') && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Branches without a Team account ({missing.length})</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {missing.map((b) => (
                    <button key={b.id} onClick={() => { setErrs({}); setMsg(''); setPw({ a: '', b: '', show: false }); setForm({ name: `${b.name} team`, loginId: `${b.code.toLowerCase()}.team`, role: 'team', branchId: b.id, password: '' }); }} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100"><Plus size={13} />{b.name}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
      {!admin && devices.accounts && <DevicesPanel accounts={devices.accounts} reload={devices.reload} onMsg={say} title="Logged-in devices of your branch" />}
      {!users ? <p className="py-8 text-center text-sm text-slate-400">Loading…</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {users.filter((u) => !roleFilter || u.role === roleFilter).map((u) => (
            <li key={u.id} className={`card space-y-3 p-4 ${u.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${u.role === 'admin' ? 'bg-violet-50 text-violet-700' : u.role === 'team' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>{u.role === 'admin' ? <ShieldCheck size={19} /> : u.role === 'team' ? <UsersIcon size={19} /> : <UserRound size={19} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{u.name}{u.id === me?.id ? ' (you)' : ''}</p>
                  <p className="truncate text-xs text-slate-500">{u.loginId} · {u.role === 'admin' ? 'Admin, all branches' : `${ROLE_LABEL[u.role] ?? u.role}, ${branchName(u.branchId)}`}</p>
                  <p className="text-xs text-slate-400">{u.lastLoginAt ? `Last sign-in ${fmtDate(u.lastLoginAt)}` : 'Never signed in'}</p>
                  <p className="mt-1 flex gap-1.5">{!u.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Inactive</span>}{u.locked && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Locked</span>}</p>
                </div>
              </div>
              {(admin || u.role === 'team') && <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost min-h-[40px]" onClick={() => open(u)}>Edit</button>
                <button className="btn-ghost min-h-[40px]" onClick={() => reset(u)}><KeyRound size={15} />Change password</button>
                {u.locked && <button className="btn-ghost min-h-[40px]" onClick={() => act(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { unlock: true } }), 'Unlocked')}>Unlock</button>}
                {u.id !== me?.id && <button className={u.active ? 'btn-danger min-h-[40px]' : 'btn-ghost min-h-[40px]'} onClick={() => act(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), u.active ? 'Deactivated' : 'Activated')}>{u.active ? 'Deactivate' : 'Activate'}</button>}
              </div>}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit user' : 'New user'}>
        {form && (
          <div className="space-y-3">
            <div><label className="label">Full name</label><input className={`input ${errs.name ? 'border-red-400' : ''}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />{err('name')}</div>
            <div><label className="label">Login ID</label><input className={`input ${errs.loginId ? 'border-red-400' : ''}`} value={form.loginId} disabled={!!form.id} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" maxLength={60} onChange={(e) => setForm({ ...form, loginId: e.target.value.replace(/\s+/g, '').toLowerCase() })} />{err('loginId')}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Role</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} disabled={!admin || form.id === me?.id}>
                <option value="manager">{ROLE_LABEL.manager}</option><option value="team">{ROLE_LABEL.team}</option><option value="admin">{ROLE_LABEL.admin}</option>
              </select>{err('role')}</div>
              {admin && needsBranch(form.role) && <div><label className="label">Branch</label><select className={`input ${errs.branchId ? 'border-red-400' : ''}`} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}><option value="">Choose</option>{branches.filter((b) => b.active !== false).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{err('branchId')}</div>}
            </div>
            {!form.id && pwBoxes(form.loginId)}
            {msg && !Object.keys(errs).length && <p className="text-sm text-red-600">{msg}</p>}
            <p className="text-xs text-slate-500">{form.role === 'team' ? 'One shared login for the branch executives, usable on many phones at once.' : form.id ? 'Changing the branch or role signs the person out. Use "Change password" on the card to set a new password.' : 'Login ID: small letters, numbers and . _ - @ only (for example pune.owner).'}</p>
            <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save user'}</button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!pwFor} onClose={() => setPwFor(null)} title={pwFor ? `Change password · ${pwFor.loginId}` : ''}>
        {pwFor && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Type the new password for <b>{pwFor.name}</b>. Every device signed in as <b>{pwFor.loginId}</b> is signed out.</p>
            {pwBoxes(pwFor.loginId)}
            {msg && !Object.keys(errs).length && <p className="text-sm text-red-600">{msg}</p>}
            <button className="btn-primary w-full" onClick={savePassword} disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!temp} onClose={() => setTemp(null)} title="Saved: login details">
        {temp && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Send these to {temp.team ? 'the branch executives' : 'the user'}. They sign in with exactly this login ID and password.</p>
            <div className="rounded-xl bg-slate-100 p-4 font-mono text-slate-900">
              <p className="text-xs font-sans text-slate-500">Login ID</p><p className="select-all text-lg font-bold">{temp.who}</p>
              <p className="mt-2 text-xs font-sans text-slate-500">Password</p><p className="select-all break-all text-lg font-bold">{temp.pw}</p>
            </div>
            <button className="btn-ghost w-full" onClick={() => { navigator.clipboard?.writeText(`Login ID: ${temp.who}\nPassword: ${temp.pw}\n${window.location.origin}/login`).then(() => say('Copied')).catch(() => {}); }}>Copy login details</button>
            <button className="btn-primary w-full" onClick={() => setTemp(null)}>Done</button>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} />
    </div>
  );
}
