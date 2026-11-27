'use client';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { api, ApiFail, setConfirmHandler } from '@/lib/api';

/**
 * The "type your password again" dialog for sensitive actions (making accounts, setting passwords,
 * switching accounts off, deleting a branch, backup, two-step login). Valid 10 minutes on this device.
 */
export default function ConfirmPasswordHost() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    setConfirmHandler(() => new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setPw(''); setErr(''); setShow(false); setOpen(true);
    }));
    return () => setConfirmHandler(null);
  }, []);

  const close = (ok: boolean) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };
  const submit = async () => {
    if (!pw) { setErr('Type your password'); return; }
    setBusy(true); setErr('');
    try { await api('/api/auth/confirm', { body: { password: pw } }, true); close(true); }
    catch (e) { setErr(e instanceof ApiFail ? e.message : 'Could not check the password'); }
    setBusy(false);
  };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/50 p-4" onClick={() => close(false)}>
      <form role="dialog" aria-modal="true" aria-labelledby="cp-title" className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700"><ShieldCheck size={24} /></span>
        <h2 id="cp-title" className="mt-3 text-lg font-bold text-slate-900">Confirm it&apos;s you</h2>
        <p className="mt-1 text-sm text-slate-600">This is a sensitive action. Type <b>your own</b> password to continue. You won&apos;t be asked again for 10 minutes on this device.</p>
        <div className="relative mt-3">
          <input autoFocus type={show ? 'text' : 'password'} className={`input pr-11 ${err ? 'border-red-400' : ''}`} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Your password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </div>
        {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? <Loader2 size={17} className="animate-spin" /> : 'Confirm'}</button>
        </div>
      </form>
    </div>
  );
}
