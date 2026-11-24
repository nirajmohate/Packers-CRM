'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2, Phone, TriangleAlert } from 'lucide-react';
import type { Field, Row } from '@/lib/types';
import { HOUSEHOLD, publicSurveyConfig, suggestionNames } from '@/lib/config';
import { BRAND } from '@/lib/brand';
import { api, ApiFail } from '@/lib/api';
import { isVisible } from '@/lib/fields';
import { cleanData, itemErrors, rowTouched, validateDoc } from '@/lib/validateDoc';
import ItemsEditor from '@/components/ItemsEditor';
import { AutoTextarea, FieldLabel, Hi } from '@/components/ui';

interface Info { company: { name: string; phone: string; email: string; address: string }; branchName: string; prefill: { customerName?: string; customerPhone?: string }; expiresAt: string }

const blank = (): Row => ({ description: '', qty: '1' });

function Input({ f, value, error, onChange }: { f: Field; value: string; error?: string; onChange: (v: string) => void }) {
  const cls = `input ${error ? 'border-red-500 ring-2 ring-red-100' : ''}`;
  const common = { id: 'f-' + f.key, 'data-err': error ? '1' : undefined } as const;
  if (f.type === 'textarea') return <AutoTextarea {...common} minRows={2} maxLength={1000} className={cls} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'select')
    return <select {...common} className={cls} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Select</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>;
  if (f.type === 'tel')
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center border-r border-slate-300 pl-3 pr-2 text-base font-semibold text-slate-600">+91</span>
        <input {...common} className={`${cls} pl-16`} value={value} placeholder="98765 43210" maxLength={16} type="tel" inputMode="tel" autoComplete="tel-national" onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  return (
    <input {...common} className={cls} value={value} placeholder={f.placeholder} maxLength={200}
      type={f.type === 'date' ? 'date' : f.validate === 'email' ? 'email' : 'text'} onChange={(e) => onChange(e.target.value)} />
  );
}

export default function SurveyForm() {
  const { token } = useParams<{ token: string }>();
  const cfg = useMemo(() => publicSurveyConfig(), []);
  const [info, setInfo] = useState<Info | null>(null);
  const [gone, setGone] = useState('');
  const [data, setData] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Row[]>([]);
  const [entry, setEntry] = useState<Row>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    api<Info>(`/api/public/survey/${encodeURIComponent(token)}`)
      .then((r) => { setInfo(r); setData({ customerName: r.prefill.customerName ?? '', customerPhone: r.prefill.customerPhone ?? '' }); })
      .catch((e) => setGone(e instanceof ApiFail ? e.message : 'Could not open the form. Check your internet and try again.'));
  }, [token]);

  const set = (k: string, v: string) => { setData((p) => ({ ...p, [k]: v })); setErrors((e) => { const c = { ...e }; delete c[k]; return c; }); };
  const withEntry = (list: Row[]) => (editing !== null ? list.map((x, j) => (j === editing ? entry : x)) : rowTouched(cfg, entry) ? [...list, entry] : list);
  const add = () => {
    const e = itemErrors(cfg, entry);
    if (Object.keys(e).length) { setEntryErrors(e); return; }
    setItems((p) => withEntry(p)); setEntry(blank()); setEditing(null); setEntryErrors({});
    setErrors((x) => { const c: Record<string, string> = {}; for (const [k, v] of Object.entries(x)) if (!k.startsWith('item-') && k !== '_items') c[k] = v; return c; });
  };

  const submit = async () => {
    if (saving) return;
    setFormError('');
    let list = items;
    if (editing !== null || rowTouched(cfg, entry)) {
      const e = itemErrors(cfg, entry);
      if (Object.keys(e).length) { setEntryErrors(e); setFormError('Finish the item in the boxes, then press Send.'); return; }
      list = withEntry(items); setItems(list); setEntry(blank()); setEditing(null);
    }
    const errs = validateDoc(cfg, data, list, { docDate: '2000-01-01', number: 'AUTO', docs: [] });
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError('Please fill the boxes marked in red.');
      setTimeout(() => (document.querySelector('[data-err="1"]') ?? document.getElementById('items-card'))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ number: string }>(`/api/public/survey/${encodeURIComponent(token)}`, { body: { data: cleanData(cfg, data), items: list } });
      setDone(r.number);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setSaving(false);
      if (e instanceof ApiFail && e.code === 'link_gone') { setGone(e.message); return; }
      if (e instanceof ApiFail && e.fields) setErrors(e.fields);
      setFormError(e instanceof ApiFail ? e.message : 'Could not send. Check your internet and try again.');
    }
  };

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-sky-50 to-white px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="card flex flex-col items-center gap-1 p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt={BRAND.name} width={180} height={112} className="h-auto w-40" />
          {info && <p className="text-xs text-slate-500">{[info.branchName, info.company.phone].filter(Boolean).join(' · ')}</p>}
        </header>
        {body}
      </div>
    </div>
  );

  if (gone) return shell(
    <div className="card p-6 text-center">
      <TriangleAlert className="mx-auto text-amber-500" size={44} />
      <p className="mt-2 text-lg font-bold text-slate-900">Link not available</p>
      <p lang="hi" className="text-sm text-slate-500">यह लिंक अब काम नहीं कर रहा</p>
      <p className="mt-2 text-sm text-slate-600">{gone}</p>
    </div>,
  );
  if (!info) return shell(<div className="grid place-items-center py-16 text-slate-400"><Loader2 className="animate-spin" size={32} /></div>);
  if (done) return shell(
    <div className="card p-6 text-center">
      <CheckCircle2 className="mx-auto text-emerald-500" size={52} />
      <p className="mt-2 text-xl font-bold text-slate-900">Thank you! Details sent.</p>
      <p lang="hi" className="text-sm text-slate-500">धन्यवाद! आपकी जानकारी भेज दी गई है।</p>
      <p className="mt-3 text-sm text-slate-600">Your reference number is <b className="text-violet-700">{done}</b>. {info.company.name} will contact you soon.</p>
      {info.company.phone && <a href={`tel:${info.company.phone}`} className="btn-primary mt-4"><Phone size={17} />Call {info.company.phone}</a>}
    </div>,
  );

  return shell(
    <>
      <section className="rounded-2xl bg-violet-600 p-4 text-white shadow">
        <p className="text-lg font-bold">Survey form for your shifting</p>
        <p lang="hi" className="text-sm text-white/90">शिफ्टिंग के लिए सर्वे फॉर्म</p>
        <p className="mt-1 text-sm text-white/90">Fill your details and the list of items to shift, then press <b>Send</b>. This link works one time only.</p>
      </section>

      {cfg.sections.map((s) => {
        const fields = s.fields.filter((f) => isVisible(f, data));
        return (
          <section key={s.title} className="card space-y-3 p-4">
            <h2 className="section-title" style={{ borderColor: cfg.color }}>{s.title} <Hi t={s.title} className="text-sm text-slate-500" /></h2>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f.key} className={f.half ? '' : 'col-span-2'}>
                  <FieldLabel text={f.label} required={f.required} htmlFor={'f-' + f.key} />
                  <Input f={f} value={data[f.key] ?? ''} error={errors[f.key]} onChange={(v) => set(f.key, v)} />
                  {errors[f.key] && <p className="mt-1 text-xs font-medium text-red-600">{errors[f.key]}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section id="items-card" className="card space-y-3 p-4">
        <h2 className="section-title" style={{ borderColor: cfg.color }}>{cfg.itemsTitle} <Hi t={cfg.itemsTitle!} className="text-sm text-slate-500" /></h2>
        {errors._items && <p className="text-xs font-medium text-red-600">{errors._items}</p>}
        <datalist id="suggest-household">{suggestionNames('household').map((x) => <option key={x} value={x} />)}</datalist>
        <ItemsEditor
          cfg={cfg} items={items} entry={entry} editing={editing} entryErrors={entryErrors} errors={errors} listId="suggest-household"
          chips={HOUSEHOLD.map((h) => h.name).filter((n) => !items.some((r) => (r.description || '').toLowerCase() === n.toLowerCase())).slice(0, 10)}
          onEntry={(k, v) => { setEntry((r) => ({ ...r, [k]: v })); setEntryErrors((e) => { const c = { ...e }; delete c[k]; return c; }); }}
          onAdd={add}
          onEdit={(i) => { setEntry({ ...blank(), ...items[i] }); setEditing(i); setEntryErrors({}); }}
          onCancelEdit={() => { setEntry(blank()); setEditing(null); setEntryErrors({}); }}
          onRemove={(i) => { setItems((p) => p.filter((_, j) => j !== i)); if (editing === i) { setEntry(blank()); setEditing(null); } else if (editing !== null && editing > i) setEditing(editing - 1); }}
          onChip={(name) => setEntry((r) => ({ ...r, description: name }))}
        />
      </section>

      {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{formError}</p>}
      <button onClick={submit} disabled={saving} className="btn w-full bg-emerald-600 py-3 text-base text-white hover:bg-emerald-700">
        {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}Send details <span lang="hi" className="font-normal">· भेजें</span>
      </button>
      <p className="pb-6 text-center text-xs text-slate-400">Your details go only to {info.company.name}.</p>
    </>,
  );
}
