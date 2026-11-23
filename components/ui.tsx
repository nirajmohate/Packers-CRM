'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as L from 'lucide-react';
import type { ModuleConfig } from '@/lib/types';
import { useActiveBranch, useActiveBranches, useBranches, useSession } from '@/lib/store';
import { hi } from '@/lib/hi';

const ICONS: Record<string, L.LucideIcon> = {
  FileText: L.FileText, ClipboardList: L.ClipboardList, PackageOpen: L.PackageOpen, Truck: L.Truck,
  CarFront: L.CarFront, FileClock: L.FileClock, ReceiptText: L.ReceiptText, BadgeIndianRupee: L.BadgeIndianRupee,
  ShieldCheck: L.ShieldCheck, Wallet: L.Wallet, Scale: L.Scale, FileCheck2: L.FileCheck2, PackageCheck: L.PackageCheck, Mail: L.Mail,
};

export function ModuleIcon({ cfg, size = 44 }: { cfg: ModuleConfig; size?: number }) {
  const Icon = ICONS[cfg.icon] ?? L.FileText;
  return (
    <span className="relative grid shrink-0 place-items-center rounded-2xl" style={{ width: size, height: size, background: cfg.color + '1a', color: cfg.color }}>
      <Icon size={size * 0.5} strokeWidth={2} />
      {cfg.isNew && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[9px] font-bold uppercase text-white">New</span>}
    </span>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800 ring-emerald-300', amber: 'bg-amber-100 text-amber-800 ring-amber-300',
  red: 'bg-red-100 text-red-700 ring-red-300', blue: 'bg-sky-100 text-sky-800 ring-sky-300', violet: 'bg-violet-100 text-violet-800 ring-violet-300',
};
const STATUS_HI: Record<string, string> = {
  pending: 'बाकी', approved: 'मंज़ूर', rejected: 'नामंज़ूर', unpaid: 'बकाया', partial: 'आधा', paid: 'भुगतान हुआ', cancelled: 'रद्द',
  scheduled: 'तय', completed: 'पूरा', 'from customer': 'ग्राहक से', packed: 'पैक', delivered: 'पहुँचा', booked: 'बुक', 'in transit': 'रास्ते में',
  draft: 'ड्राफ्ट', sent: 'भेजा', received: 'मिला',
};
export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = s === 'from customer' ? 'violet' : /unpaid|reject|cancel/.test(s) ? 'red'
    : /paid|approved|completed|delivered|received|packed|issued|dispatched|loaded|final/.test(s) ? 'green'
    : /pending|partial|draft|loading/.test(s) ? 'amber' : 'blue';
  const h = STATUS_HI[s];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TONES[tone]}`}>{status}{h && <span lang="hi" className="font-normal opacity-80"> · {h}</span>}</span>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100" aria-label="Close"><L.X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-xl bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg">{msg}</div>;
}

export function BranchSelect({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const user = useSession();
  const all = useBranches();
  const branches = useActiveBranches();
  const [active, setActive] = useActiveBranch();
  const tone = dark ? 'border-white/30 bg-white/10 text-white' : 'border-slate-500 bg-white text-slate-700';
  if (user?.role === 'manager') {
    return (
      <span className={`flex items-center gap-1.5 ${className}`}>
        <L.MapPin size={15} className={dark ? 'text-white/80' : 'text-slate-500'} />
        <span className={`min-w-0 flex-1 truncate rounded-lg border px-2 py-1.5 text-sm font-medium ${tone}`}>{all.find((b) => b.id === user.branchId)?.name ?? 'Branch'}</span>
      </span>
    );
  }
  return (
    <label className={`flex items-center gap-1.5 ${className}`}>
      <L.MapPin size={15} className={dark ? 'text-white/80' : 'text-slate-500'} />
      <select aria-label="Branch" value={active} onChange={(e) => setActive(e.target.value)} className={`min-w-0 flex-1 rounded-lg border py-1.5 pl-2 pr-6 text-sm font-medium ${tone}`}>
        <option value="all" className="text-slate-900">All branches</option>
        {branches.map((b) => <option key={b.id} value={b.id} className="text-slate-900">{b.name}</option>)}
      </select>
    </label>
  );
}

/* ---------- "Are you sure?" popup ---------- */
export type ConfirmTone = 'green' | 'red' | 'amber' | 'blue';
export interface ConfirmOpts { title: string; message: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: ConfirmTone }
const CONFIRM_TONES: Record<ConfirmTone, { icon: L.LucideIcon; ring: string; btn: string }> = {
  green: { icon: L.CircleCheck, ring: 'bg-emerald-50 text-emerald-600', btn: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  red: { icon: L.CircleX, ring: 'bg-red-50 text-red-600', btn: 'bg-red-600 text-white hover:bg-red-700' },
  amber: { icon: L.TriangleAlert, ring: 'bg-amber-50 text-amber-600', btn: 'bg-amber-600 text-white hover:bg-amber-700' },
  blue: { icon: L.CircleHelp, ring: 'bg-brand-50 text-brand-600', btn: 'bg-brand-600 text-white hover:bg-brand-700' },
};

/** `const [ask, dialog] = useConfirm();` then `if (await ask({...})) doIt();` and render `{dialog}` once. */
export function useConfirm(): [(o: ConfirmOpts) => Promise<boolean>, React.ReactNode] {
  const [cur, setCur] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setCur({ ...o, resolve })), []);
  const done = useCallback((v: boolean) => setCur((c) => { c?.resolve(v); return null; }), []);
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [cur, done]);
  if (!cur) return [ask, null];
  const t = CONFIRM_TONES[cur.tone ?? 'blue'];
  const Icon = t.icon;
  const dialog = (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" onClick={() => done(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${t.ring}`}><Icon size={30} /></span>
        <h2 id="confirm-title" className="mt-3 text-lg font-bold text-slate-900">{cur.title}</h2>
        <div className="mt-2 text-sm text-slate-600">{cur.message}</div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button autoFocus className="btn-ghost" onClick={() => done(false)}>{cur.cancelLabel ?? 'No, go back'}</button>
          <button className={`btn ${t.btn}`} onClick={() => done(true)}>{cur.confirmLabel ?? 'Yes'}</button>
        </div>
      </div>
    </div>
  );
  return [ask, dialog];
}

/** Colour and wording for a status change popup. */
export function statusTone(status: string): ConfirmTone {
  const s = status.toLowerCase();
  if (/reject|cancel/.test(s)) return 'red';
  if (/approved|paid|completed|delivered|received|packed|issued|final/.test(s)) return 'green';
  if (/pending|draft|partial/.test(s)) return 'amber';
  return 'blue';
}

/** Small Hindi word under or next to an English label (nothing if there is no Hindi for it). */
export function Hi({ t, className = '' }: { t: string; className?: string }) {
  const h = hi(t);
  return h ? <span lang="hi" className={`font-normal ${className}`}>{h}</span> : null;
}

/** Field label: English on the first line, Hindi on the second, each cut with "…" if too long,
 *  so boxes placed side by side always line up on a phone. */
export function FieldLabel({ text, required, htmlFor }: { text: string; required?: boolean; htmlFor?: string }) {
  const h = hi(text);
  return (
    <label className="label" htmlFor={htmlFor} title={h ? `${text} · ${h}` : text}>
      <span className="block truncate">{text}{required && <span className="text-red-500"> *</span>}</span>
      <span lang="hi" className="block truncate text-[11px] font-normal text-slate-400">{h || ' '}</span>
    </label>
  );
}

/** Text box that grows with what is typed, so nothing is hidden behind a scroll bar. */
export function AutoTextarea({ value, minRows = 2, className = '', ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 640) + 'px';
  }, [value]);
  useEffect(() => {
    // the width changes when a phone is turned, so the height must too
    const onResize = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 640) + 'px'; } };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return <textarea ref={ref} rows={minRows} value={value} className={`${className} resize-none overflow-hidden`} {...rest} />;
}
