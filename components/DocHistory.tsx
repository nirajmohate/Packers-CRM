'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import type { AuditEntry } from '@/lib/types';
import { api } from '@/lib/api';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Who created, edited, or deleted this document, and what changed. */
export default function DocHistory({ docId, stamp }: { docId: string; stamp: string }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ entries: AuditEntry[] }>(`/api/audit?docId=${docId}`).then((r) => { if (live) { setRows(r.entries); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [docId, stamp]);

  return (
    <section className="card p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900"><History size={17} />History</h2>
      {failed && <p className="text-sm text-slate-500">History could not be loaded.</p>}
      {!rows && !failed && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">No history yet.</p>}
      <ul className="divide-y divide-slate-100">
        {rows?.map((e) => (
          <li key={e.id} className="py-2.5 text-sm">
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)} disabled={!e.changes?.length}>
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{e.summary}</span>
                <span className="block text-xs text-slate-500">{e.userName} · {when(e.at)}</span>
              </span>
              {!!e.changes?.length && <ChevronDown size={16} className={`mt-1 shrink-0 text-slate-400 transition ${open === e.id ? 'rotate-180' : ''}`} />}
            </button>
            {open === e.id && (
              <ul className="mt-2 space-y-1 rounded-xl bg-slate-50 p-2.5 text-xs">
                {e.changes!.map((c, i) => (
                  <li key={i} className="break-words"><b className="text-slate-700">{c.field}:</b> <span className="text-slate-500 line-through">{c.from || '(empty)'}</span> <span className="text-slate-900">{c.to || '(empty)'}</span></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
