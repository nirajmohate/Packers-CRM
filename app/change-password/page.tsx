'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { api, ApiFail } from '@/lib/api';

function Form() {
  const voluntary = useSearchParams().get('voluntary') === '1';
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setErrs({});
    if (f.next !== f.again) { setErrs({ again: 'The two passwords do not match' }); return; }
    setBusy(true);
    try { await api('/api/auth/change-password', { body: { current: f.current, next: f.next } }); window.location.href = '/'; }
    catch (err) { if (err instanceof ApiFail) { setErrs(err.fields ?? {}); setError(err.message); } else setError('Could not change the password'); setBusy(false); }
  };
  const field = (k: 'current' | 'next' | 'again', label: string, hint?: string) => (
    <div><label className="label" htmlFor={k}>{label}</label>
      <input id={k} type="password" className={`input ${errs[k] ? 'border-red-400' : ''}`} autoComplete={k === 'current' ? 'current-password' : 'new-password'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required />
      {errs[k] ? <p className="mt-1 text-xs text-red-600">{errs[k]}</p> : hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>
  );
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-700 to-sky-400 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white"><KeyRound size={22} /></span>
          <div><p className="text-lg font-bold text-slate-900">{voluntary ? 'Change password' : 'Choose a new password'}</p>{!voluntary && <p className="text-xs text-slate-500">You are using a temporary password</p>}</div>
        </div>
        {field('current', voluntary ? 'Current password' : 'Temporary password')}
        {field('next', 'New password', 'At least 8 characters with a letter and a number')}
        {field('again', 'New password again')}
        {error && !Object.keys(errs).length && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : 'Save password'}</button>
        {voluntary && <a href="/" className="btn-ghost w-full">Cancel</a>}
      </form>
    </div>
  );
}

export default function ChangePassword() {
  return <Suspense fallback={null}><Form /></Suspense>;
}
