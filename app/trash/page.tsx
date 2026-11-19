'use client';
import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { BY_SLUG } from '@/lib/config';
import { fmtDate } from '@/lib/format';
import { ApiFail, emptyTrash, loadTrash, purgeDoc, restoreDoc, useSession, useTrash } from '@/lib/store';
import { ModuleIcon, Toast } from '@/components/ui';

const DAYS = 30;

export default function Trash() {
  const trash = useTrash();
  const user = useSession();
  const admin = user?.role === 'admin';
  const [toast, setToast] = useState('');
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const fail = (e: unknown) => say(e instanceof ApiFail ? e.message : 'Something went wrong');

  useEffect(() => { loadTrash().catch(fail); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">Recycle bin</h1><p className="text-xs text-slate-500">Deleted documents are kept for {DAYS} days{admin ? '' : '. Only the admin can delete them permanently'}</p></div>
        {admin && !!trash?.length && <button className="btn-danger" onClick={async () => { if (window.confirm(`Delete all ${trash.length} documents permanently?`)) { try { await emptyTrash(); } catch (e) { fail(e); } } }}>Empty bin</button>}
      </div>
      {trash === null ? <p className="py-8 text-center text-sm text-slate-400">Loading…</p> : trash.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">The recycle bin is empty.</div> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {trash.map((d) => {
            const cfg = BY_SLUG[d.type];
            if (!cfg) return null;
            const left = Math.max(DAYS - Math.floor((Date.now() - new Date(d.deletedAt!).getTime()) / 86400000), 0);
            return (
              <li key={d.id} className="card flex items-center gap-3 p-3.5">
                <ModuleIcon cfg={cfg} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{d.data[cfg.party ?? 'customerName'] || '—'}</p>
                  <p className="truncate text-xs text-slate-500">{cfg.title} {d.number} · {fmtDate(d.docDate)}</p>
                  <p className="text-[11px] text-slate-400">{left} days left</p>
                </div>
                <button aria-label="Restore" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600" onClick={() => restoreDoc(d.id).catch(fail)}><RotateCcw size={17} /></button>
                {admin && <button aria-label="Delete forever" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-500" onClick={() => { if (window.confirm('Delete this document permanently?')) purgeDoc(d.id).catch(fail); }}><Trash2 size={17} /></button>}
              </li>
            );
          })}
        </ul>
      )}
      <Toast msg={toast} />
    </div>
  );
}
