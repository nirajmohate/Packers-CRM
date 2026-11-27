'use client';
import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Printer, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { api, ApiFail } from '@/lib/api';
import { Toast } from '@/components/ui';

/** Admin: two-step login with an authenticator app (free), and its backup codes. */
export default function Security() {
  const [st, setSt] = useState<{ enabled: boolean; backupLeft: number } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };
  const load = useCallback(async () => { try { setSt(await api('/api/auth/2fa')); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { if (!(e instanceof ApiFail && e.code === 'confirm_cancelled')) setErr((e as Error).message); } setBusy(false); };
  const start = () => run(async () => {
    const r = await api<{ secret: string; uri: string }>('/api/auth/2fa', { body: { action: 'start' } });
    const QR = (await import('qrcode')).default;
    setSetup({ ...r, qr: await QR.toDataURL(r.uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }) });
    setCode('');
  });
  const enable = () => run(async () => {
    const r = await api<{ backupCodes: string[] }>('/api/auth/2fa', { body: { action: 'enable', code } });
    setCodes(r.backupCodes); setSetup(null); await load(); say('Two-step login is on');
  });
  const disable = () => run(async () => {
    if (!window.confirm('Turn off two-step login? Then only the password protects this admin account.')) return;
    await api('/api/auth/2fa', { body: { action: 'disable' } }); setCodes(null); await load(); say('Two-step login is off');
  });
  const newCodes = () => run(async () => { const r = await api<{ backupCodes: string[] }>('/api/auth/2fa', { body: { action: 'backup' } }); setCodes(r.backupCodes); await load(); });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><ShieldCheck size={22} /></span>
        <div><h1 className="text-xl font-bold text-slate-900">Security</h1><p className="text-xs text-slate-500">Two-step login for your admin account</p></div>
      </div>

      <section className="card space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 shrink-0 text-brand-700" size={20} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">Two-step login {st && <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${st.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{st.enabled ? 'ON' : 'OFF'}</span>}</p>
            <p className="text-sm text-slate-600">After your password, the login also asks for a 6-digit code from a free app on your phone (Google Authenticator or Microsoft Authenticator). Even if someone learns your password, they cannot sign in without your phone.</p>
          </div>
        </div>
        {!st ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading…</p> : !st.enabled && !setup ? (
          <button className="btn-primary w-full sm:w-auto" disabled={busy} onClick={start}><ShieldCheck size={17} />Turn on two-step login</button>
        ) : st.enabled ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Backup codes left: <b>{st.backupLeft}</b> (each works once, for when the phone is lost).</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-ghost" disabled={busy} onClick={newCodes}><KeyRound size={16} />Make new backup codes</button>
              <button className="btn-danger" disabled={busy} onClick={disable}>Turn off</button>
            </div>
          </div>
        ) : null}

        {setup && (
          <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Install <b>Google Authenticator</b> (or Microsoft Authenticator) on your phone.</li>
              <li>In the app tap <b>+</b> → <b>Scan a QR code</b> and scan this:</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for the authenticator app" width={200} height={200} className="mx-auto rounded-xl bg-white p-2" />
            <p className="text-center text-xs text-slate-500">Can&apos;t scan? Type this key in the app: <b className="select-all font-mono text-slate-800">{setup.secret}</b></p>
            <ol start={3} className="list-decimal pl-5 text-sm text-slate-700"><li>Type the 6-digit code the app shows:</li></ol>
            <div className="flex gap-2">
              <input className="input flex-1 text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" aria-label="6-digit code" />
              <button className="btn-primary" disabled={busy || code.length !== 6} onClick={enable}>{busy ? <Loader2 size={17} className="animate-spin" /> : 'Turn on'}</button>
            </div>
          </div>
        )}
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
      </section>

      {codes && (
        <section className="card space-y-3 border-2 border-amber-300 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900"><ShieldAlert size={18} />Save these backup codes now</p>
          <p className="text-sm text-slate-600">If your phone is lost, each code can be used <b>once</b> instead of the 6-digit code. They are shown only now. Write them down or print them and keep them safe (not on the same phone).</p>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-3 font-mono text-base font-semibold text-slate-900 sm:grid-cols-4">{codes.map((c) => <span key={c} className="select-all">{c}</span>)}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(codes.join('\n')).then(() => say('Copied')).catch(() => {}); }}><Copy size={16} />Copy</button>
            <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Print</button>
          </div>
        </section>
      )}

      <section className="card space-y-2 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Also protecting your CRM</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>New device alert:</b> when an admin account is opened on a new phone or computer, the dashboard shows it with &quot;Was this you?&quot;. Telegram / email alerts can be switched on in Vercel (see README).</li>
          <li><b>Password again</b> before making accounts, setting passwords, switching accounts off, deleting a branch or downloading the backup.</li>
          <li>Lost your phone and backup codes? On the computer with the project run <span className="font-mono">npm run reset-password -- &lt;login id&gt; &lt;new password&gt;</span>: it also turns two-step login off for that account.</li>
        </ul>
      </section>
      <Toast msg={msg} />
    </div>
  );
}
