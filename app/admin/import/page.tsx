'use client';
import { useEffect, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { api } from '@/lib/api';
import { ApiFail, clearLegacyBrowserData, readLegacyBrowserData, refresh, refreshBranches, useBranches, useSession } from '@/lib/store';

interface Report { imported: number; duplicates: number; invalid: number; relinked: number; settings: string }
type Legacy = ReturnType<typeof readLegacyBrowserData>;

export default function ImportPage() {
  const me = useSession();
  const branches = useBranches();
  const [legacy, setLegacy] = useState<Legacy | null>(null);
  const [prev, setPrev] = useState<{ importedAt: string | null; report: Report | null } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [def, setDef] = useState('');
  const [withSettings, setWithSettings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => { setLegacy(readLegacyBrowserData()); api<{ importedAt: string | null; report: Report | null }>('/api/import').then(setPrev).catch(() => {}); }, []);
  if (me && me.role !== 'admin') return <p className="py-10 text-center text-slate-500">Only the admin can import data.</p>;
  if (!legacy) return null;

  const localIds = [...new Set(legacy.docs.map((d) => d.branchId).filter(Boolean))] as string[];
  const localName = (id: string) => legacy.branches.find((b) => b.id === id)?.name ?? id;
  const active = branches.filter((b) => b.active !== false);

  const run = async () => {
    setBusy(true); setError('');
    try {
      const finalMap: Record<string, string> = {};
      for (const id of localIds) {
        let target = map[id] || '';
        if (target === '__new__') {
          const lb = legacy.branches.find((b) => b.id === id);
          const created = await api<{ branch: { id: string } }>('/api/branches', { body: { name: lb?.name || id, code: (lb?.code || (lb?.name || 'BR').slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'BR', city: lb?.city || '' } });
          target = created.branch.id;
        }
        if (target) finalMap[id] = target;
      }
      const r = await api<{ report: Report }>('/api/import', { body: { docs: legacy.docs, branchMap: finalMap, defaultBranchId: def, ...(withSettings && legacy.company ? { settings: { company: legacy.company, terms: legacy.terms } } : {}) } });
      await refreshBranches(); await refresh(true);
      setReport(r.report);
    } catch (e) { setError(e instanceof ApiFail ? e.message : 'Import failed'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700"><DatabaseBackup size={22} /></span>
        <div><h1 className="text-xl font-bold text-slate-900">Import old data</h1><p className="text-xs text-slate-500">Moves the documents saved in this browser (Stage 1) into the database</p></div>
      </div>

      {prev?.importedAt && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">An import was already done on {new Date(prev.importedAt).toLocaleDateString('en-IN')}. Running it again is safe: documents whose number already exists are skipped.</p>}

      {report ? (
        <section className="card space-y-3 p-5">
          <p className="text-lg font-bold text-emerald-700">Import finished</p>
          <ul className="space-y-1 text-sm text-slate-700">
            <li>Documents imported: <b>{report.imported}</b></li><li>Skipped (number already exists): <b>{report.duplicates}</b></li>
            <li>Skipped (not valid): <b>{report.invalid}</b></li><li>Receipts linked back to their bill: <b>{report.relinked}</b></li><li>Company settings: <b>{report.settings}</b></li>
          </ul>
          <button className="btn-ghost w-full" onClick={() => { if (window.confirm('Remove the old data from this browser? Do this only after you have checked the imported documents.')) { clearLegacyBrowserData(); setLegacy(readLegacyBrowserData()); } }}>Remove old data from this browser</button>
        </section>
      ) : legacy.docs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No Stage 1 data was found in this browser. Open this page in the browser where you used the earlier version.</div>
      ) : (
        <section className="card space-y-4 p-4">
          <p className="text-sm text-slate-700">Found <b>{legacy.docs.length}</b> documents{legacy.company ? ' and company settings' : ''} in this browser.</p>
          {localIds.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-slate-900">Which branch does each old branch belong to?</h2>
              {localIds.map((id) => (
                <div key={id}><label className="label">{localName(id)} ({legacy.docs.filter((d) => d.branchId === id).length} documents)</label>
                  <select className="input" value={map[id] ?? ''} onChange={(e) => setMap({ ...map, [id]: e.target.value })}>
                    <option value="">Use the default branch below</option><option value="__new__">Create a new branch &quot;{localName(id)}&quot;</option>
                    {active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select></div>
              ))}
            </div>
          )}
          <div><label className="label">Default branch (for documents without a branch)</label>
            <select className="input" value={def} onChange={(e) => setDef(e.target.value)}><option value="">Choose</option>{active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          {legacy.company && <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} />Also import company details, logo, stamp, signature and terms</label>}
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !def} onClick={run}>{busy ? 'Importing…' : `Import ${legacy.docs.length} documents`}</button>
        </section>
      )}
    </div>
  );
}
