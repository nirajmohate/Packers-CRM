'use client';
import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { BY_SLUG } from '@/lib/config';
import { fmtDate } from '@/lib/format';
import { ApiFail, emptyTrash, loadTrash, purgeDoc, restoreDoc, useSession, useTrash } from '@/lib/store';
import { ModuleIcon, Toast } from '@/components/ui';
import { LoadCounter, LoadMore, useInfinite } from '@/components/Infinite';

const DAYS = 30;

export default function Trash() {
  const trash = useTrash();
  const user = useSession();
  const admin = user?.role === 'admin';
  const [toast, setToast] = useState('');
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const fail = (e: unknown) => say(e instanceof ApiFail ? e.message : 'Something went wrong');

  useEffect(() => { loadTrash().catch(fail); }, []);
  const rows = (trash ?? []).filter((d) => BY_SLUG[d.type]);
  const [shown, sentinel, more] = useInfinite(rows.length, 'trash');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">Recycle bin</h1><p className="text-xs text-slate-500">Deleted documents are kept for {DAYS} days{admin ? '' : '. Only the admin can delete them permanently'}</p></div>
        {admin && !!trash?.length && <button className="btn-danger" onClick={async () => { if (window.confirm(`Delete all ${trash.length} documents permanently?`)) { try { await emptyTrash(); } catch (e) { fail(e); } } }}>Empty bin</button>}
      </div>
      {trash === null ? <p className="py-8 text-center text-sm text-slate-400">Loading…</p> : trash.length === 0 ? <div className="card p-8 text-center text-sm text-slate-500">The recycle bin is empty.</div> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead><tr className="bg-slate-700 text-xs uppercase tracking-wide text-white">
                <th className="w-10 px-3 py-2.5">#</th><th className="px-3 py-2.5">Document</th><th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Reason for delete</th><th className="px-3 py-2.5">Days left</th><th className="px-3 py-2.5 text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-200">
                {rows.slice(0, shown).map((d, i) => {
                  const cfg = BY_SLUG[d.type]!;
                  const left = Math.max(DAYS - Math.floor((Date.now() - new Date(d.deletedAt!).getTime()) / 86400000), 0);
                  return (
                    <tr key={d.id} className={i % 2 ? 'bg-slate-50/80' : 'bg-white'}>
                      <td className="px-3 py-2.5 font-semibold text-slate-500">{i + 1}.</td>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-2"><ModuleIcon cfg={cfg} size={32} /><span><span className="block whitespace-nowrap font-bold" style={{ color: cfg.color }}>{d.number}</span><span className="text-xs text-slate-500">{cfg.title} · {fmtDate(d.docDate)}</span></span></span></td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold uppercase text-fuchsia-700">{d.data[cfg.party ?? 'customerName'] || '—'}</td>
                      <td className="max-w-[260px] px-3 py-2.5 text-xs">
                        <span className="block break-words font-medium text-red-700">{d.deleteReason || <span className="text-slate-400">No reason (deleted before reasons were asked)</span>}</span>
                        <span className="block text-[11px] text-slate-500">{d.deletedByName ? `by ${d.deletedByName} · ` : ''}{d.deletedAt ? fmtDate(d.deletedAt.slice(0, 10)) : ''}</span>
                      </td>
                      <td className={`px-3 py-2.5 text-xs font-semibold ${left <= 5 ? 'text-red-600' : 'text-slate-600'}`}>{left} days</td>
                      <td className="px-3 py-2.5"><span className="flex justify-end gap-1.5">
                        <button className="btn min-h-[34px] bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700" onClick={() => restoreDoc(d.id).then(() => say(`${d.number} restored`)).catch(fail)}><RotateCcw size={15} />Restore</button>
                        {admin && <button aria-label="Delete forever" className="grid h-9 w-9 place-items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200" onClick={() => { if (window.confirm('Delete this document permanently?')) purgeDoc(d.id).catch(fail); }}><Trash2 size={16} /></button>}
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <LoadMore shown={shown} total={rows.length} sentinel={sentinel} more={more} />
          <LoadCounter shown={shown} total={rows.length} />
        </>
      )}
      <Toast msg={toast} />
    </div>
  );
}
