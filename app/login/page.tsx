'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { api, ApiFail } from '@/lib/api';
import { boot } from '@/lib/store';

function Form() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/';
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>('/api/auth/setup').then((r) => { if (r.needsSetup) router.replace('/setup'); }).catch(() => {});
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api<{ user: { mustChangePassword: boolean } }>('/api/auth/login', { body: { loginId, password } });
      if (r.user.mustChangePassword) window.location.href = '/change-password';
      else { await boot(); window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/'; }
    } catch (err) {
      setError(err instanceof ApiFail ? err.message : 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-700 to-sky-400 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt={BRAND.name} width={220} height={137} className="mx-auto h-auto w-52" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Billing &amp; CRM</p>
          <p className="text-xs text-slate-500">Sign in to continue</p>
        </div>
        <div><label className="label" htmlFor="loginId">Login ID</label>
          <input id="loginId" className="input" autoComplete="username" autoCapitalize="none" value={loginId} onChange={(e) => setLoginId(e.target.value)} required /></div>
        <div><label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}</button>
        <p className="text-center text-xs text-slate-400">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={null}><Form /></Suspense>;
}
