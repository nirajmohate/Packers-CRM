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
  // two-step login: after a right password the server asks for the 6-digit code
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    api<{ needsSetup: boolean }>('/api/auth/setup').then((r) => { if (r.needsSetup) router.replace('/setup'); }).catch(() => {});
  }, [router]);

  const go = async () => { await boot(); window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/'; };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (ticket) {
        await api('/api/auth/login/code', { body: { ticket, code } });
        await go();
        return;
      }
      const r = await api<{ user?: { mustChangePassword: boolean }; twoFactor?: boolean; ticket?: string }>('/api/auth/login', { body: { loginId, password } });
      if (r.twoFactor && r.ticket) { setTicket(r.ticket); setCode(''); setPassword(''); setBusy(false); return; }
      await go();
    } catch (err) {
      if (err instanceof ApiFail && err.code === 'ticket_expired') { setTicket(''); setCode(''); }
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
        {ticket ? (
          <div className="space-y-2">
            <p className="rounded-lg bg-brand-50 p-2.5 text-sm text-brand-800">Open your authenticator app and type the 6-digit code for <b>Cloud Packers CRM</b>. Lost phone? Type one of your backup codes.</p>
            <label className="label" htmlFor="code">Code</label>
            <input id="code" autoFocus className="input text-center font-mono text-lg tracking-[0.3em]" inputMode="text" autoComplete="one-time-code" autoCapitalize="none" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.trim())} required placeholder="000000" />
            <button type="button" className="text-xs text-slate-500 underline" onClick={() => { setTicket(''); setCode(''); setError(''); }}>Back to password</button>
          </div>
        ) : (<>
        <div><label className="label" htmlFor="loginId">Login ID</label>
          <input id="loginId" className="input" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={loginId} onChange={(e) => setLoginId(e.target.value)} required /></div>
        <div><label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        </>)}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm font-medium text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : ticket ? 'Verify' : 'Sign in'}</button>
        <p className="text-center text-xs text-slate-400">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={null}><Form /></Suspense>;
}
