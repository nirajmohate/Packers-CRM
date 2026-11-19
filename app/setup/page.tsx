'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Truck } from 'lucide-react';
import { api, ApiFail } from '@/lib/api';

export default function Setup() {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);
  const [f, setF] = useState({ name: '', loginId: 'admin', password: '', companyName: 'Cloud Packers', branchName: 'Head Office', branchCode: 'HO' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ needsSetup: boolean }>('/api/auth/setup').then((r) => { if (!r.needsSetup) router.replace('/login'); else setOk(true); }).catch(() => setOk(true)); }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setErrs({});
    try { await api('/api/auth/setup', { body: f }); window.location.href = '/'; }
    catch (err) { if (err instanceof ApiFail) { setErrs(err.fields ?? {}); setError(err.message); } else setError('Could not finish setup'); setBusy(false); }
  };
  const field = (k: keyof typeof f, label: string, type = 'text', hint?: string) => (
    <div><label className="label" htmlFor={k}>{label}</label>
      <input id={k} type={type} className={`input ${errs[k] ? 'border-red-400' : ''}`} value={f[k]} autoCapitalize="none" onChange={(e) => setF({ ...f, [k]: k === 'branchCode' ? e.target.value.toUpperCase() : e.target.value })} required />
      {errs[k] ? <p className="mt-1 text-xs text-red-600">{errs[k]}</p> : hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}</div>
  );
  if (!ok) return <div className="grid min-h-screen place-items-center text-slate-400"><Loader2 className="animate-spin" size={32} /></div>;
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-700 to-sky-400 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white"><Truck size={24} /></span>
          <div><p className="text-lg font-bold text-slate-900">First-time setup</p><p className="text-xs text-slate-500">Create the admin account. This page works only once.</p></div>
        </div>
        {field('name', 'Your name')}
        {field('loginId', 'Admin login ID')}
        {field('password', 'Password', 'password', 'At least 8 characters with a letter and a number')}
        {field('companyName', 'Company name')}
        <div className="grid grid-cols-3 gap-3"><div className="col-span-2">{field('branchName', 'First branch')}</div>{field('branchCode', 'Code')}</div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : 'Create admin and continue'}</button>
      </form>
    </div>
  );
}
