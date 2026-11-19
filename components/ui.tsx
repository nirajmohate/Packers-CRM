'use client';
import { useEffect } from 'react';
import * as L from 'lucide-react';
import type { ModuleConfig } from '@/lib/types';
import { useActiveBranch, useActiveBranches, useBranches, useSession } from '@/lib/store';

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
  green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600', blue: 'bg-sky-50 text-sky-700',
};
export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = /unpaid|reject|cancel/.test(s) ? 'red'
    : /paid|approved|completed|delivered|received|packed|issued|dispatched|loaded|final/.test(s) ? 'green'
    : /pending|partial|draft|loading/.test(s) ? 'amber' : 'blue';
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{status}</span>;
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
  const tone = dark ? 'border-white/30 bg-white/10 text-white' : 'border-slate-300 bg-white text-slate-700';
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
