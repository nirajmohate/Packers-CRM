'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus } from 'lucide-react';
import type { CompanyProfile } from '@/lib/types';
import { MODULES } from '@/lib/config';
import { DEFAULT_COMPANY } from '@/lib/defaults';
import { effectiveCompany } from '@/lib/settingsFn';
import { ApiFail, saveSettings, uploadAsset, useActiveBranches, useSession, useSettings } from '@/lib/store';
import { formatNumber, fyOf, hasSeqToken } from '@/lib/numbering';
import { todayISO } from '@/lib/format';
import { STATES } from '@/lib/states';
import { Toast } from '@/components/ui';

type ImgKind = 'logo' | 'stamp' | 'signature';
const ID_KEY = { logo: 'logoId', stamp: 'stampId', signature: 'signatureId' } as const;
const RATIO_KEY = { logo: 'logoRatio', stamp: 'stampRatio', signature: 'signRatio' } as const;
const TEXT_KEYS = ['name', 'tagline', 'contactPerson', 'address', 'state', 'phone', 'email', 'gstin', 'pan', 'bankName', 'accountName', 'accountNo', 'ifsc', 'upi'] as const;
type TextKey = (typeof TEXT_KEYS)[number];

function toPng(file: File, max: number): Promise<{ url: string; ratio: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      resolve({ url: c.toDataURL('image/png'), ratio: c.width / c.height });
    };
    img.onerror = () => reject(new Error('bad image'));
    img.src = src;
  });
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5 rounded" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

export default function Settings() {
  const me = useSession();
  const bundle = useSettings();
  const branches = useActiveBranches();
  const [scope, setScope] = useState('global');
  const isGlobal = scope === 'global';
  const [text, setText] = useState<Record<TextKey, string>>({} as Record<TextKey, string>);
  const [imgs, setImgs] = useState<Record<ImgKind, { id: string; ratio: number }>>({ logo: { id: '', ratio: 1 }, stamp: { id: '', ratio: 1 }, signature: { id: '', ratio: 2 } });
  const [rules, setRules] = useState({ numberFormat: DEFAULT_COMPANY.numberFormat, numberPerBranch: true, numberFyReset: true, pdfStamp: true, pdfQr: true, pdfWatermark: true });
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [termSlug, setTermSlug] = useState(MODULES[0].slug);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const files = { logo: useRef<HTMLInputElement>(null), stamp: useRef<HTMLInputElement>(null), signature: useRef<HTMLInputElement>(null) };
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  const inherited = effectiveCompany(bundle, null); // company-wide values (placeholders for a branch)
  const inheritedTerms = (slug: string) => (bundle?.terms.global[slug] ?? MODULES.find((m) => m.slug === slug)!.terms).join('\n');
  const ownTerms = (slug: string) => (isGlobal ? bundle?.terms.global[slug] : bundle?.terms.branch[scope]?.[slug]);

  // load the form whenever the scope or the saved settings change
  useEffect(() => {
    if (!bundle) return;
    const src = (isGlobal ? bundle.global : bundle.branch[scope] ?? {}) as Partial<CompanyProfile>;
    setText(Object.fromEntries(TEXT_KEYS.map((k) => [k, String(src[k] ?? '')])) as Record<TextKey, string>);
    setImgs({
      logo: { id: String(src.logoId ?? ''), ratio: Number(src.logoRatio) || 1 }, stamp: { id: String(src.stampId ?? ''), ratio: Number(src.stampRatio) || 1 },
      signature: { id: String(src.signatureId ?? ''), ratio: Number(src.signRatio) || 2 },
    });
    if (isGlobal) setRules({ numberFormat: bundle.global.numberFormat, numberPerBranch: bundle.global.numberPerBranch, numberFyReset: bundle.global.numberFyReset, pdfStamp: bundle.global.pdfStamp, pdfQr: bundle.global.pdfQr, pdfWatermark: bundle.global.pdfWatermark });
    setTerms({});
    setErrs({});
  }, [bundle, scope, isGlobal]);

  if (me && me.role !== 'admin') return <p className="py-10 text-center text-slate-500">Only the admin can change settings.</p>;
  if (!bundle) return null;

  const onImage = async (kind: ImgKind, file?: File) => {
    if (!file) return;
    try {
      const { url, ratio } = await toPng(file, kind === 'logo' ? 300 : 360);
      const r = await uploadAsset(kind, scope, url, ratio);
      setImgs((p) => ({ ...p, [kind]: { id: r.id, ratio: r.ratio } }));
    } catch (e) { say(e instanceof ApiFail ? e.message : 'That file is not a usable image.'); }
  };

  const save = async () => {
    setBusy(true); setErrs({});
    try {
      const profile: Record<string, unknown> = {};
      for (const k of TEXT_KEYS) profile[k] = text[k]?.trim() ?? '';
      for (const kind of ['logo', 'stamp', 'signature'] as const) {
        const cur = isGlobal ? bundle.global[ID_KEY[kind]] : bundle.branch[scope]?.[ID_KEY[kind]] ?? '';
        if (imgs[kind].id !== cur) { profile[ID_KEY[kind]] = imgs[kind].id; if (imgs[kind].id) profile[RATIO_KEY[kind]] = imgs[kind].ratio; }
      }
      const t: Record<string, string[] | null> = {};
      for (const [slug, v] of Object.entries(terms)) {
        const lines = v.split('\n').map((x) => x.trim()).filter(Boolean);
        t[slug] = lines.join('\n') === inheritedTerms(slug) && (isGlobal || !ownTerms(slug)) ? null : lines.join('\n') === (isGlobal ? MODULES.find((m) => m.slug === slug)!.terms.join('\n') : inheritedTerms(slug)) ? null : lines;
      }
      await saveSettings({ scope, profile, ...(isGlobal ? { rules } : {}), ...(Object.keys(t).length ? { terms: t } : {}) });
      say('Settings saved');
    } catch (e) {
      if (e instanceof ApiFail) { setErrs(e.fields ?? {}); say(e.message); setTimeout(() => document.querySelector('[data-err="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); }
      else say('Could not save');
    }
    setBusy(false);
  };

  const err = (k: string) => (errs[k] ? <p className="mt-1 text-xs font-medium text-red-600">{errs[k]}</p> : null);
  const inp = (k: TextKey, label: string, o: { half?: boolean; area?: boolean; upper?: boolean } = {}) => {
    const ph = isGlobal ? '' : String(inherited[k] ?? '');
    const common = { value: text[k] ?? '', placeholder: ph, onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText({ ...text, [k]: o.upper ? e.target.value.toUpperCase() : e.target.value }) };
    return (
      <div className={o.half ? '' : 'col-span-2'}>
        <label className="label">{label}</label>
        {o.area ? <textarea rows={2} className="input" {...common} /> : <input data-err={errs[k] ? '1' : undefined} className={`input ${errs[k] ? 'border-red-400 ring-2 ring-red-100' : ''}`} {...common} />}
        {err(k)}
      </div>
    );
  };
  const imgBox = (kind: ImgKind, label: string, hint: string) => (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {imgs[kind].id ? <img src={`/api/assets/${imgs[kind].id}`} alt={label} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="text-slate-400" />}
      </div>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{label}</p><p className="text-xs text-slate-400">{imgs[kind].id ? '' : isGlobal ? hint : `${hint}. Empty means the company's is used.`}</p></div>
      <button className="btn-ghost min-h-[40px]" onClick={() => files[kind].current?.click()}>Upload</button>
      {imgs[kind].id && <button className="btn-ghost min-h-[40px] text-red-600" onClick={() => setImgs((p) => ({ ...p, [kind]: { ...p[kind], id: '' } }))}>Remove</button>}
      <input ref={files[kind]} type="file" accept="image/*" hidden onChange={(e) => { onImage(kind, e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );

  const sampleBranch = branches.find((b) => b.id === scope) ?? branches[0];
  const preview = hasSeqToken(rules.numberFormat) ? formatNumber(rules.numberFormat, { prefix: 'QTN', br: sampleBranch?.code || 'BR', fy: fyOf(todayISO()), seq: 1, date: todayISO() }) : '-';
  const termMod = MODULES.find((m) => m.slug === termSlug)!;
  const shownTerms = terms[termSlug] ?? (ownTerms(termSlug) ? (ownTerms(termSlug) as string[]).join('\n') : isGlobal ? termMod.terms.join('\n') : inheritedTerms(termSlug));
  const termsOverridden = !isGlobal && (terms[termSlug] !== undefined || !!ownTerms(termSlug));

  return (
    <div className="space-y-4 pb-28">
      <div><h1 className="text-xl font-bold text-slate-900">Settings</h1><p className="text-xs text-slate-500">Company details appear on every PDF. A branch can use its own.</p></div>

      <section className="card space-y-2 p-4">
        <label className="label">Editing settings for</label>
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="global">Company defaults (all branches)</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name} branch only</option>)}
        </select>
        {!isGlobal && <p className="text-xs text-slate-500">Leave a field empty to use the company default (shown in grey). Anything you fill in applies to this branch&apos;s documents only.</p>}
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="font-semibold text-slate-900">Company</h2>
        {imgBox('logo', 'Logo', 'Shown at the top of every PDF')}
        <div className="grid grid-cols-2 gap-3">
          {inp('name', 'Company name')}{inp('tagline', 'Tagline')}{inp('contactPerson', 'Contact person (shown in the greeting)')}
          {inp('address', 'Address', { area: true })}{inp('phone', 'Phone', { half: true })}{inp('email', 'Email', { half: true })}
          {inp('gstin', 'GSTIN', { half: true, upper: true })}{inp('pan', 'PAN', { half: true, upper: true })}
          <div className="col-span-2"><label className="label">State (decides CGST + SGST or IGST)</label>
            <select className="input" value={text.state ?? ''} onChange={(e) => setText({ ...text, state: e.target.value })}>
              <option value="">{isGlobal ? 'Select' : `Company default${inherited.state ? ` (${inherited.state})` : ''}`}</option>{STATES.map((s) => <option key={s}>{s}</option>)}
            </select></div>
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="font-semibold text-slate-900">Stamp &amp; signature</h2>
        {imgBox('stamp', 'Company stamp', 'PNG with a transparent background looks best')}
        {imgBox('signature', 'Authorised signature', 'Placed above the signatory line')}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">Bank details (quotations, proformas and bills)</h2>
        <div className="grid grid-cols-2 gap-3">
          {inp('bankName', 'Bank name', { half: true })}{inp('accountName', 'Account name', { half: true })}
          {inp('accountNo', 'Account number', { half: true })}{inp('ifsc', 'IFSC', { half: true, upper: true })}{inp('upi', 'UPI ID')}
        </div>
      </section>

      {isGlobal && (
        <>
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold text-slate-900">Document numbering (all branches)</h2>
            <div>
              <label className="label">Number format</label>
              <input data-err={errs.numberFormat ? '1' : undefined} className={`input font-mono ${errs.numberFormat ? 'border-red-400' : ''}`} value={rules.numberFormat} onChange={(e) => setRules({ ...rules, numberFormat: e.target.value })} />
              {err('numberFormat')}
              <p className="mt-1 text-xs text-slate-500">Example quotation number: <b className="font-mono text-slate-800">{preview}</b></p>
              <p className="mt-1 text-xs text-slate-400">{'{PREFIX}'} document code · {'{BR}'} branch code · {'{DATE}'} document date (23-11-26) · {'{FY}'} financial year · {'{YY}'} start year · {'{NN}'} / {'{NNNN}'} running number. With {'{DATE}'} the running number starts again at 01 every day.</p>
            </div>
            <Toggle label="Separate running numbers for each branch" checked={rules.numberPerBranch} onChange={(v) => setRules({ ...rules, numberPerBranch: v })} />
            <Toggle label="Restart numbers every financial year (April)" checked={rules.numberFyReset} onChange={(v) => setRules({ ...rules, numberFyReset: v })} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost min-h-[38px] text-xs" onClick={() => setRules({ ...rules, numberFormat: '{PREFIX}/{BR}/{DATE}/{NN}' })}>QTN/DEL/23-11-26/01 style (daily)</button>
              <button className="btn-ghost min-h-[38px] text-xs" onClick={() => setRules({ ...rules, numberFormat: '{PREFIX}/{BR}/{FY}/{NNNN}' })}>QTN/DEL/2026-27/0001 style</button>
              <button className="btn-ghost min-h-[38px] text-xs" onClick={() => setRules({ ...rules, numberFormat: '{PREFIX}-{BR}-{NNNN}' })}>INV-PUN-0001 style</button>
            </div>
            <p className="text-xs text-amber-700">Changing this only affects documents created from now on. Numbers are assigned by the server and are never reused.</p>
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold text-slate-900">PDF defaults</h2>
            <Toggle label="Add stamp & signature" checked={rules.pdfStamp} onChange={(v) => setRules({ ...rules, pdfStamp: v })} />
            <Toggle label="Add UPI payment QR code" checked={rules.pdfQr} onChange={(v) => setRules({ ...rules, pdfQr: v })} />
            <Toggle label="PAID / UNPAID watermark on bills" checked={rules.pdfWatermark} onChange={(v) => setRules({ ...rules, pdfWatermark: v })} />
          </section>
        </>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">Terms &amp; conditions{isGlobal ? '' : ` for ${sampleBranch ? branches.find((b) => b.id === scope)?.name : 'this branch'}`}</h2>
        <p className="text-xs text-slate-500">One term per line. {isGlobal ? 'Used for every branch unless a branch has its own.' : termsOverridden ? 'This branch has its own text for this document.' : 'Using the company text. Edit to give this branch its own.'}</p>
        <select className="input" value={termSlug} onChange={(e) => setTermSlug(e.target.value)}>{MODULES.filter((m) => m.terms.length).map((m) => <option key={m.slug} value={m.slug}>{m.title}</option>)}</select>
        <textarea className="input" rows={6} value={shownTerms} onChange={(e) => setTerms({ ...terms, [termSlug]: e.target.value })} />
        <button className="btn-ghost min-h-[38px] text-xs" onClick={() => setTerms({ ...terms, [termSlug]: isGlobal ? termMod.terms.join('\n') : inheritedTerms(termSlug) })}>{isGlobal ? 'Reset to built-in text' : 'Use the company text'}</button>
      </section>

      {isGlobal && (
        <section className="card space-y-3 p-4">
          <h2 className="font-semibold text-slate-900">Backup</h2>
          <p className="text-xs text-slate-500">Downloads every branch, setting and document (including the recycle bin) as one file. It never includes passwords.</p>
          <a className="btn-ghost" href="/api/backup"><Download size={16} />Download backup</a>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:left-64 lg:pb-3">
        <button className="btn-primary w-full lg:w-auto lg:px-10" onClick={save} disabled={busy}>{busy ? 'Saving…' : isGlobal ? 'Save company settings' : 'Save branch settings'}</button>
      </div>
      <Toast msg={toast} />
    </div>
  );
}
