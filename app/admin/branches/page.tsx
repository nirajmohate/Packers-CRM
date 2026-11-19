'use client';
import { useState } from 'react';
import { Building2, Plus } from 'lucide-react';
import type { Branch } from '@/lib/types';
import { api } from '@/lib/api';
import { ApiFail, refreshBranches, useBranches, useSession } from '@/lib/store';
import { Sheet, Toast } from '@/components/ui';

const blank = { name: '', code: '', city: '', address: '', phone: '' };

export default function Branches() {
  const branches = useBranches();
  const user = useSession();
  const [edit, setEdit] = useState<{ id?: string; f: typeof blank } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  if (user && user.role !== 'admin') return <p className="py-10 text-center text-slate-500">Only the admin can manage branches.</p>;

  const open = (b?: Branch) => { setErrs({}); setMsg(''); setEdit({ id: b?.id, f: b ? { name: b.name, code: b.code, city: b.city, address: b.address, phone: b.phone } : blank }); };
  const save = async () => {
    if (!edit) return;
    setBusy(true); setErrs({}); setMsg('');
    try {
      await api(edit.id ? `/api/branches/${edit.id}` : '/api/branches', { method: edit.id ? 'PATCH' : 'POST', body: edit.f });
      await refreshBranches(); setEdit(null); say('Branch saved');
    } catch (e) { if (e instanceof ApiFail) { setErrs(e.fields ?? {}); setMsg(e.message); } else setMsg('Could not save'); }
    setBusy(false);
  };
  const toggle = async (b: Branch) => {
    try { await api(`/api/branches/${b.id}`, { method: 'PATCH', body: { active: b.active === false } }); await refreshBranches(); }
    catch (e) { say(e instanceof ApiFail ? e.message : 'Could not change the branch'); }
  };
  const remove = async (b: Branch) => {
    if (!window.confirm(`Delete branch ${b.name}? This only works for a branch with no documents or managers.`)) return;
    try { await api(`/api/branches/${b.id}`, { method: 'DELETE' }); await refreshBranches(); say('Branch deleted'); }
    catch (e) { say(e instanceof ApiFail ? e.message : 'Could not delete'); }
  };
  const field = (k: keyof typeof blank, label: string, half = false) => (
    <div className={half ? '' : 'col-span-2'}><label className="label">{label}</label>
      <input className={`input ${errs[k] ? 'border-red-400' : ''}`} value={edit!.f[k]} onChange={(e) => setEdit({ ...edit!, f: { ...edit!.f, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value } })} />
      {errs[k] && <p className="mt-1 text-xs text-red-600">{errs[k]}</p>}</div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-900">Branches</h1><p className="text-xs text-slate-500">Each branch has its own documents, numbering and (optionally) company details</p></div>
        <button className="btn-primary" onClick={() => open()}><Plus size={17} />Add</button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {branches.map((b) => (
          <li key={b.id} className={`card space-y-3 p-4 ${b.active === false ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 size={19} /></span>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{b.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">{b.code}</span></p>
                <p className="truncate text-xs text-slate-500">{[b.city, b.phone].filter(Boolean).join(' · ') || 'No details'}{b.active === false ? ' · inactive' : ''}</p></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-ghost min-h-[40px]" onClick={() => open(b)}>Edit</button>
              <button className="btn-ghost min-h-[40px]" onClick={() => toggle(b)}>{b.active === false ? 'Activate' : 'Deactivate'}</button>
              <button className="btn-danger min-h-[40px]" onClick={() => remove(b)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-1 text-xs text-slate-400">Company details, bank details, stamp and terms for a branch are set in Settings (choose the branch there).</p>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit branch' : 'New branch'}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">{field('name', 'Branch name', true)}</div>{field('code', 'Code', true)}
              {field('city', 'City', true)}{field('phone', 'Phone', true)}{field('address', 'Address on PDFs (optional)')}
            </div>
            {edit.id && <p className="text-xs text-amber-700">Changing the code only affects new document numbers.</p>}
            {msg && !Object.keys(errs).length && <p className="text-sm text-red-600">{msg}</p>}
            <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save branch'}</button>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} />
    </div>
  );
}
