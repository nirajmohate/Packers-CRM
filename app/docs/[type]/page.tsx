'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download, Plus, Search } from 'lucide-react';
import { BY_SLUG } from '@/lib/config';
import { docCalc } from '@/lib/ledger';
import { fmtDate, inr, todayISO } from '@/lib/format';
import { docRows, exportSheets, partyOf } from '@/lib/export';
import { useActiveBranch, useBranches, useDocs, useHomeState } from '@/lib/store';
import { ModuleIcon, Sheet, StatusBadge } from '@/components/ui';

export default function DocList() {
  const { type } = useParams<{ type: string }>();
  const cfg = BY_SLUG[type];
  const docs = useDocs();
  const live = useDocs();
  const home = useHomeState();
  const branches = useBranches();
  const [active] = useActiveBranch();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [menu, setMenu] = useState(false);
  if (!cfg) return <p className="py-10 text-center text-slate-500">Unknown document type.</p>;

  const all = docs.filter((d) => d.type === type).map((d) => ({ d, c: docCalc(d, cfg, live, home(d.branchId)) }));
  const statuses = cfg.slug === 'bill' ? ['Unpaid', 'Partial', 'Paid', 'Cancelled'] : cfg.statuses;
  const list = all
    .filter(({ c }) => status === 'All' || c.status === status)
    .filter(({ d }) => !q || JSON.stringify([d.number, d.data]).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.d.docDate.localeCompare(a.d.docDate) || b.d.createdAt.localeCompare(a.d.createdAt));
  const hasAmount = !!(cfg.money || cfg.calc);
  const exportNow = async (f: 'csv' | 'xlsx') => {
    setMenu(false);
    await exportSheets([{ name: cfg.title, rows: docRows(cfg, list.map((x) => x.d), live, branches, home) }], `${cfg.short}-${todayISO()}`, f);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ModuleIcon cfg={cfg} />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{cfg.title}</h1>
          <p className="text-xs text-slate-500">{all.length} saved{active !== 'all' ? ' in this branch' : ''}</p>
        </div>
        <button onClick={() => setMenu(true)} disabled={!list.length} className="btn-ghost" aria-label="Export"><Download size={17} /><span className="hidden sm:inline">Export</span></button>
        <Link href={`/docs/${type}/new`} className="btn-primary hidden sm:inline-flex"><Plus size={18} />New</Link>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-10" placeholder="Search name, number, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {['All', ...statuses].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${status === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{s}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-semibold text-slate-900">{all.length ? 'Nothing matches your search' : `No ${cfg.title.toLowerCase()} yet`}</p>
          {!all.length && <Link href={`/docs/${type}/new`} className="btn-primary mt-4">Create the first one</Link>}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map(({ d, c }) => (
            <li key={d.id}>
              <Link href={`/docs/${type}/view?id=${d.id}`} className="card flex items-center gap-3 p-3.5 active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{partyOf(d, cfg) || '—'}</p>
                  <p className="truncate text-xs text-slate-500">{d.number} · {fmtDate(d.docDate)}</p>
                  {(d.data.fromCity || d.data.toCity) && <p className="mt-0.5 truncate text-xs text-slate-500">{d.data.fromCity} → {d.data.toCity}</p>}
                  {active === 'all' && d.branchId && <p className="mt-0.5 text-[11px] text-slate-400">{branches.find((b) => b.id === d.branchId)?.name}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {hasAmount && <span className="font-bold text-slate-900">{inr(c.total)}</span>}
                  {cfg.slug === 'bill' && c.balance != null && c.balance > 0 && c.status !== 'Cancelled' && <span className="text-[11px] text-amber-700">Due {inr(c.balance)}</span>}
                  <StatusBadge status={c.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href={`/docs/${type}/new`} aria-label={`New ${cfg.title}`} className="fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/40 sm:hidden"><Plus size={26} /></Link>

      <Sheet open={menu} onClose={() => setMenu(false)} title={`Export ${list.length} ${cfg.title.toLowerCase()}`}>
        <div className="grid gap-3">
          <button className="btn-primary" onClick={() => exportNow('xlsx')}>Excel (.xlsx)</button>
          <button className="btn-ghost" onClick={() => exportNow('csv')}>CSV</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Exports what you see now, after search and status filters.</p>
      </Sheet>
    </div>
  );
}
