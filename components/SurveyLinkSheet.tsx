'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, MessageCircle, Share2, XCircle } from 'lucide-react';
import { api, ApiFail } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { refresh, useActiveBranch, useActiveBranches, useCompany, useSession } from '@/lib/store';
import { Hi, Sheet, useConfirm } from './ui';

interface LinkRow { id: string; branchId: string; createdByName: string; createdAt: string; expiresAt: string; state: 'open' | 'used' | 'expired' | 'cancelled'; customerName: string; customerPhone: string; docId: string; docNumber: string }
const STATE: Record<LinkRow['state'], [string, string]> = {
  open: ['Waiting for customer', 'bg-sky-50 text-sky-700'],
  used: ['Filled', 'bg-emerald-50 text-emerald-700'],
  expired: ['Expired', 'bg-slate-100 text-slate-600'],
  cancelled: ['Cancelled', 'bg-red-50 text-red-600'],
};

/** Make a one-time survey link and send it to a customer (WhatsApp, copy, or the phone's share menu). */
export default function SurveyLinkSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession();
  const branches = useActiveBranches();
  const [active] = useActiveBranch();
  const co = useCompany();
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [url, setUrl] = useState('');
  const [made, setMade] = useState<{ id: string; number: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const isManager = !!user && user.role !== 'admin'; // branch owner or team: always their own branch

  const load = useCallback(() => {
    api<{ links: LinkRow[] }>('/api/survey-links' + (!isManager && active !== 'all' ? `?branch=${active}` : '')).then((r) => setLinks(r.links)).catch(() => setLinks([]));
  }, [isManager, active]);
  useEffect(() => {
    if (!open) return;
    setUrl(''); setError(''); setCopied(false); setName(''); setPhone('');
    setBranchId(isManager ? user?.branchId ?? '' : active !== 'all' ? active : branches.length === 1 ? branches[0].id : '');
    load();
    refresh(); // pick up surveys customers have sent
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setError('');
    if (!isManager && !branchId) { setError('Choose the branch this survey is for'); return; }
    setBusy(true);
    try {
      const r = await api<{ path: string; doc?: { id: string; number: string } }>('/api/survey-links', { body: { branchId, customerName: name.trim(), customerPhone: phone.trim() } });
      setUrl(window.location.origin + r.path);
      setMade(r.doc ? { id: r.doc.id, number: r.doc.number } : null);
      load();
      refresh(); // the new survey ("Link sent") shows in the list right away
    } catch (e) { setError(e instanceof ApiFail ? e.message : 'Could not make the link'); }
    setBusy(false);
  };
  const message = `Hello${name.trim() ? ' ' + name.trim() : ''}, please fill your shifting details and items list for ${co.name} here: ${url}\n(The link works one time and is valid for 7 days.)`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt('Copy this link:', url); }
  };
  const whatsapp = () => {
    const d = phoneDigits(phone);
    window.open(`https://wa.me/${d.length === 10 ? '91' + d : d}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Survey form', text: message }); } catch { /* closed */ } }
    else copy();
  };
  const cancel = async (l: LinkRow) => {
    const ok = await ask({ tone: 'red', title: 'Cancel this link?', confirmLabel: 'Yes, cancel link', message: <p>The customer{l.customerName ? ` (${l.customerName})` : ''} will not be able to open this link any more.</p> });
    if (!ok) return;
    try { await api(`/api/survey-links/${l.id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e instanceof ApiFail ? e.message : 'Could not cancel'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share survey link">
      {!url ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
            Send a link to the customer. They fill their details and items on their phone, and the survey appears in your Survey List. <Hi t="Share survey link" className="block text-xs text-violet-700" />
          </p>
          {!isManager && (
            <div><label className="label">Branch <Hi t="Branch" className="text-slate-400" /></label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Choose branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Customer name (optional) <Hi t="Customer name" className="text-slate-400" /></label><input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label">Mobile (optional) <Hi t="Mobile number" className="text-slate-400" /></label><div className="relative"><span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base font-semibold text-slate-600">+91</span><input className="input pl-12" type="tel" inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} /></div></div>
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <button className="btn w-full bg-violet-600 text-white hover:bg-violet-700" disabled={busy} onClick={create}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={18} />}Make link</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><Check size={18} />Link ready. Send it now: it is shown only once.</p>
          {made && <p className="rounded-xl bg-sky-50 p-2.5 text-xs text-sky-900">Survey <b>{made.number}</b> is in your Survey List as <b>Link sent</b>. When the customer sends the form it changes to <b>Filled by customer</b>.</p>}
          <p className="break-all rounded-xl border-[1.5px] border-slate-500 bg-slate-50 p-3 font-mono text-xs text-slate-800">{url}</p>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={whatsapp}><MessageCircle size={17} />WhatsApp</button>
            <button className="btn-ghost" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copied' : 'Copy'}</button>
            <button className="btn-ghost" onClick={share}><Share2 size={17} />Share</button>
          </div>
          <p className="text-xs text-slate-500">Works one time, for 7 days. You can cancel it below.</p>
          <button className="btn-ghost w-full" onClick={() => setUrl('')}>Make another link</button>
        </div>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">Recent links</p>
        {links === null ? <p className="text-xs text-slate-400">Loading…</p> : links.length === 0 ? <p className="text-xs text-slate-500">No links yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{l.customerName || 'Customer'}{l.customerPhone ? ` · ${l.customerPhone}` : ''}</p>
                  <p className="text-xs text-slate-500">Made {fmtDate(l.createdAt.slice(0, 10))} by {l.createdByName}{l.state === 'open' ? ` · valid till ${fmtDate(l.expiresAt.slice(0, 10))}` : ''}</p>
                </div>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE[l.state][1]}`}>{STATE[l.state][0]}</span>
                {l.docId && <Link href={`/docs/survey/view?id=${l.docId}`} className="text-xs font-semibold text-brand-700 underline" onClick={onClose}>{l.docNumber || 'Open'}</Link>}
                {l.state === 'open' && <button aria-label="Cancel link" onClick={() => cancel(l)} className="grid h-8 w-8 place-items-center rounded-full text-red-500"><XCircle size={18} /></button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmDialog}
    </Sheet>
  );
}
