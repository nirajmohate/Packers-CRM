'use client';
import { useState } from 'react';
import { Building2, Plus, Wand2 } from 'lucide-react';
import type { Branch } from '@/lib/types';
import { api } from '@/lib/api';
import { ApiFail, refreshBranches, useBranches, useSession } from '@/lib/store';
import { Sheet, Toast } from '@/components/ui';
import DevicesPanel, { useDevices } from '@/components/DevicesPanel';

const blank = { name: '', code: '', city: '', address: '', phone: '', phone2: '' };

export default function Branches() {
  const branches = useBranches();
  const user = useSession();
  const [edit, setEdit] = useState<{ id?: string; f: typeof blank } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const { accounts, reload } = useDevices('all');
  const [plan, setPlan] = useState<{ add: { name: string; code: string }[]; update: { name: string; as: string; code: string }[]; others: { name: string; code: string; action: string; docs: number }[] } | null>(null);
  const [applying, setApplying] = useState(false);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  if (user && user.role !== 'admin') return <p className="py-10 text-center text-slate-500">Only the admin can manage branches.</p>;

  const open = (b?: Branch) => { setErrs({}); setMsg(''); setEdit({ id: b?.id, f: b ? { name: b.name, code: b.code, city: b.city, address: b.address, phone: b.phone, phone2: b.phone2 ?? '' } : blank }); };
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
  const openPresets = async () => {
    try { setPlan(await api('/api/branches/presets')); } catch (e) { say(e instanceof ApiFail ? e.message : 'Could not load'); }
  };
  const applyPresets = async () => {
    setApplying(true);
    try {
      const r = await api<{ added: number; updated: number; off: number; removed: number }>('/api/branches/presets', { body: {} });
      await refreshBranches(); await reload(); setPlan(null);
      say(`Done: ${r.added} added, ${r.updated} updated${r.off ? `, ${r.off} switched off` : ''}${r.removed ? `, ${r.removed} deleted` : ''}`);
    } catch (e) { say(e instanceof ApiFail ? e.message : 'Could not set up the branches'); }
    setApplying(false);
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
        <button className="btn-ghost" onClick={openPresets}><Wand2 size={17} /><span className="hidden sm:inline">Set up the 17 branches</span><span className="sm:hidden">17 branches</span></button>
        <button className="btn-primary" onClick={() => open()}><Plus size={17} />Add</button>
      </div>
      {accounts && (
        <div className="card space-y-2 p-4">
          <p className="text-sm font-bold text-slate-900">Admin accounts</p>
          <DevicesPanel accounts={accounts.filter((u) => u.role === 'admin')} reload={reload} onMsg={say} title="Admin logged-in devices" />
        </div>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {branches.map((b) => (
          <li key={b.id} className={`card space-y-3 p-4 ${b.active === false ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Building2 size={19} /></span>
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{b.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">{b.code}</span></p>
                <p className="truncate text-xs text-slate-500">{[b.city, b.phone, b.phone2].filter(Boolean).join(' · ') || 'No details'}{b.active === false ? ' · inactive' : ''}</p></div>
            </div>
            {accounts && <DevicesPanel accounts={accounts.filter((u) => u.branchId === b.id)} reload={reload} onMsg={say} title="Logged-in devices" />}
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
              {field('city', 'City', true)}{field('phone', 'Phone', true)}{field('phone2', 'Second phone (optional)', true)}{field('address', 'Address on PDFs (optional)')}
            </div>
            {edit.id && <p className="text-xs text-amber-700">Changing the code only affects new document numbers.</p>}
            {msg && !Object.keys(errs).length && <p className="text-sm text-red-600">{msg}</p>}
            <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save branch'}</button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!plan} onClose={() => setPlan(null)} title="Set up the 17 Cloud Packers branches">
        {plan && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">Uses the addresses and phone numbers from cloudpackers.com. Nothing is changed until you tap <b>Apply</b>.</p>
            {plan.update.length > 0 && <div><p className="font-semibold text-slate-900">Update contact details ({plan.update.length})</p><p className="text-xs text-slate-600">{plan.update.map((u) => `${u.name} (${u.code})${u.as !== u.name ? ` = ${u.as}` : ''}`).join(', ')}</p><p className="mt-0.5 text-[11px] text-slate-500">Name and code stay the same, so document numbers do not change.</p></div>}
            {plan.add.length > 0 && <div><p className="font-semibold text-emerald-800">Add new ({plan.add.length})</p><p className="text-xs text-slate-600">{plan.add.map((a) => `${a.name} (${a.code})`).join(', ')}</p></div>}
            {plan.others.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                <p className="font-semibold text-amber-900">Not one of the 17 ({plan.others.length})</p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-900">{plan.others.map((o) => <li key={o.code}>{o.name} ({o.code}): {o.action === 'delete' ? 'deleted (it is empty)' : `switched off, its ${o.docs} document(s) are kept`}</li>)}</ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button className="btn-ghost" onClick={() => setPlan(null)}>Cancel</button>
              <button className="btn-primary" disabled={applying} onClick={applyPresets}>{applying ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        )}
      </Sheet>
      <Toast msg={toast} />
    </div>
  );
}
