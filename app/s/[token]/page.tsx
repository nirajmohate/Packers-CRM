'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarClock, CheckCircle2, ClipboardList, Loader2, Lock, MapPin, Phone, Send, ShieldCheck, Sofa, TriangleAlert, UserRound } from 'lucide-react';
import type { Field, Row } from '@/lib/types';
import { HOUSEHOLD, publicSurveyConfig, suggestionNames } from '@/lib/config';
import { BRAND } from '@/lib/brand';
import { api, ApiFail } from '@/lib/api';
import { isVisible } from '@/lib/fields';
import { cleanData, itemErrors, rowTouched, validateDoc } from '@/lib/validateDoc';
import ItemsEditor from '@/components/ItemsEditor';
import { AutoTextarea, FieldLabel } from '@/components/ui';

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
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#dbeafe,_#f8fafc_55%)] px-3 pb-28 pt-4 sm:px-4 sm:pt-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-sky-500 text-white shadow-lg">
          <div className="flex items-center gap-3 p-4 sm:p-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white p-1.5 shadow sm:h-20 sm:w-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BRAND.logo} alt={BRAND.name} className="h-auto w-full" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold sm:text-xl">{info?.company.name || BRAND.name}</p>
              <p className="text-xs text-white/85">{BRAND.slogan}</p>
              {info && (info.branchName || info.company.phone) && (
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/90">
                  {info.branchName && <span className="inline-flex items-center gap-1"><MapPin size={12} />{info.branchName}</span>}
                  {info.company.phone && <a href={`tel:${info.company.phone}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline"><Phone size={12} />{info.company.phone}</a>}
                </p>
              )}
            </div>
          </div>
        </header>
        {body}
      </div>
    </div>
  );
  const step = (n: number, title: string, sub: string, Icon: typeof UserRound) => (
    <div className="mb-3 flex items-center gap-3">
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={20} /><span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{n}</span></span>
      <div className="min-w-0"><h2 className="font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500">{sub}</p></div>
    </div>
  );
  const SECTION_ICON = [UserRound, MapPin, CalendarClock, ClipboardList];

  if (gone) return shell(
    <div className="card p-6 text-center">
      <TriangleAlert className="mx-auto text-amber-500" size={44} />
      <p className="mt-2 text-lg font-bold text-slate-900">Link not available</p>
      <p className="mt-2 text-sm text-slate-600">{gone}</p>
    </div>,
  );
  if (!info) return shell(<div className="grid place-items-center py-16 text-slate-400"><Loader2 className="animate-spin" size={32} /></div>);
  if (done) return shell(
    <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50"><CheckCircle2 className="text-emerald-500" size={52} /></span>
      <p className="mt-3 text-xl font-bold text-slate-900">Thank you! Details sent.</p>
      <p className="mt-3 text-sm text-slate-600">Your reference number is <b className="text-violet-700">{done}</b>. {info.company.name} will contact you soon.</p>
      {info.company.phone && <a href={`tel:${info.company.phone}`} className="btn-primary mt-4"><Phone size={17} />Call {info.company.phone}</a>}
    </div>,
  );

  return shell(
    <>
      <section className="rounded-3xl border border-sky-200 bg-white p-4 shadow-sm sm:p-5">
        <h1 className="text-xl font-bold text-slate-900">Shifting survey form</h1>
        <p className="mt-1 text-sm text-slate-600">Tell us about your move and the items to shift. It takes about 2 minutes. Boxes marked <span className="text-red-500">*</span> are needed.</p>
        <ol className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-slate-600 sm:text-xs">
          <li className="rounded-xl bg-brand-50 px-2 py-2 text-brand-700">1. Your details</li>
          <li className="rounded-xl bg-slate-50 px-2 py-2">2. Items</li>
          <li className="rounded-xl bg-slate-50 px-2 py-2">3. Send</li>
        </ol>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Lock size={13} />Private link for you · works one time{info.expiresAt ? ` · valid till ${new Date(info.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>
      </section>

      {cfg.sections.map((s, si) => {
        const fields = s.fields.filter((f) => isVisible(f, data));
        return (
          <section key={s.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {step(si + 1, s.title, si === 0 ? 'So we can call you back' : 'Where and when you are moving', SECTION_ICON[si] ?? ClipboardList)}
            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                <div key={f.key} className={f.half ? 'col-span-2 min-[380px]:col-span-1' : 'col-span-2'}>
                  <FieldLabel text={f.label} required={f.required} htmlFor={'f-' + f.key} />
                  <Input f={f} value={data[f.key] ?? ''} error={errors[f.key]} onChange={(v) => set(f.key, v)} />
                  {errors[f.key] && <p className="mt-1 text-xs font-medium text-red-600">{errors[f.key]}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section id="items-card" className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {step(cfg.sections.length + 1, cfg.itemsTitle || 'Items to shift', 'Tap a common item or type your own, then Add', Sofa)}
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
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><ShieldCheck size={14} className="text-emerald-600" />Your details go only to {info.company.name}.</p>
      {/* send button stays at the bottom of the screen on phones */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="hidden text-xs text-slate-500 min-[400px]:block sm:hidden">{items.length} item{items.length === 1 ? '' : 's'} added</p>
          <button onClick={submit} disabled={saving} className="btn flex-1 bg-emerald-600 py-3 text-base text-white shadow-md hover:bg-emerald-700">
            {saving ? <Loader2 size={20} className="animate-spin" /> : <Send size={19} />}{saving ? 'Sending…' : 'Send details'}
          </button>
        </div>
      </div>
    </>,
  );
}
