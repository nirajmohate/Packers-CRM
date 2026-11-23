'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Ban, Copy, Download, MessageCircle, Pencil, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { BY_SLUG, CONVERT } from '@/lib/config';
import { docCalc } from '@/lib/ledger';
import { fmtDate, inr, inrPdf, todayISO } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { ApiFail, createDoc, setDocStatus, softDelete, useAllDocs, useBranches, useCompanyFor, useHydrated, useTermsFor } from '@/lib/store';
import { loadCompanyImages } from '@/lib/images';
import { downloadPdf, sharePdf, type PdfOpts } from '@/lib/pdf';
import DocView from '@/components/DocView';
import DocHistory from '@/components/DocHistory';
import PaymentSheet from '@/components/PaymentSheet';
import { Hi, ModuleIcon, StatusBadge, Toast, statusTone, useConfirm } from '@/components/ui';

function Detail() {
  const { type } = useParams<{ type: string }>();
  const id = useSearchParams().get('id');
  const router = useRouter();
  const all = useAllDocs();
  const branches = useBranches();
  const companyFor = useCompanyFor();
  const termsFor = useTermsFor();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [pay, setPay] = useState(false);
  const [opts, setOpts] = useState<PdfOpts>({ stamp: true, qr: true, watermark: true });
  const [ask, confirmDialog] = useConfirm();

  const cfg = BY_SLUG[type];
  const rec = all.find((d) => d.id === id);
  const co = companyFor(rec?.branchId);
  useEffect(() => setOpts({ stamp: co.pdfStamp, qr: co.pdfQr, watermark: co.pdfWatermark }), [co.pdfStamp, co.pdfQr, co.pdfWatermark]);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const fail = (e: unknown, fallback: string) => say(e instanceof ApiFail ? e.message : fallback);

  if (!ready) return null;
  if (!cfg || !rec) return <p className="py-10 text-center text-slate-500">Document not found, or it belongs to another branch. <Link href={`/docs/${type}`} className="text-brand-700 underline">Back to the list</Link></p>;

  const calc = docCalc(rec, cfg, all, co.state);
  const branch = branches.find((b) => b.id === rec.branchId);
  const terms = (rec.data.terms !== undefined ? rec.data.terms : termsFor(cfg.slug, rec.branchId, cfg.terms).join('\n')).split('\n').map((t) => t.trim()).filter(Boolean);
  const name = rec.data[cfg.party ?? 'customerName'] || '';
  const isBill = rec.type === 'bill';
  const pdfCtx = async () => ({ company: co, images: await loadCompanyImages(co), branch, docs: all, terms, opts });

  const download = async () => {
    setBusy(true);
    try { await downloadPdf(rec, cfg, await pdfCtx()); } catch (e) { console.error(e); say('Could not create the PDF. Please try again.'); }
    setBusy(false);
  };
  const share = async () => {
    setBusy(true);
    try {
      if (!(await sharePdf(rec, cfg, await pdfCtx()))) {
        const d = phoneDigits(rec.data.customerPhone || rec.data.payeePhone || '');
        const text = `Hello ${name},\nYour ${cfg.title} ${rec.number}${calc.total ? ` for ${inrPdf(calc.total)}` : ''} from ${co.name} is ready.${calc.balance ? ` Balance due: ${inrPdf(calc.balance)}.` : ''}`;
        window.open(`https://wa.me/${d.length === 10 ? '91' + d : d}?text=${encodeURIComponent(text)}`, '_blank');
        say('This browser cannot attach files. Tap Download PDF, then attach it in WhatsApp.');
      }
    } catch (e) { console.error(e); say('Could not share the PDF.'); }
    setBusy(false);
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const data = { ...rec.data };
      delete data.againstId; delete data.againstDoc;
      const copy = await createDoc({ type, branchId: rec.branchId, docDate: todayISO(), status: cfg.statuses[0], data, items: rec.items });
      router.push(`/docs/${type}/view?id=${copy.id}`);
    } catch (e) { fail(e, 'Could not duplicate'); setBusy(false); }
  };
  const remove = async () => {
    const linked = isBill ? all.filter((d) => d.type === 'receipt' && d.data.againstId === rec.id).length : 0;
    const ok = await ask({
      tone: 'red', title: 'Move to recycle bin?', confirmLabel: 'Yes, delete',
      message: (<><p>{cfg.title} <b className="text-slate-900">{rec.number}</b> will be moved to the recycle bin. You can restore it within 30 days.</p>
        {linked > 0 && <p className="mt-2 text-amber-700">This bill has {linked} receipt(s). They stay, but will no longer be linked to a live bill.</p>}</>),
    });
    if (!ok) return;
    try { await softDelete(rec.id); router.replace(`/docs/${type}`); } catch (e) { fail(e, 'Could not delete'); }
  };
  const toggleCancel = async () => {
    const cancelling = rec.status !== 'Cancelled';
    const ok = await ask(cancelling
      ? { tone: 'red', title: 'Cancel this bill?', confirmLabel: 'Yes, cancel bill', message: <p>Bill <b className="text-slate-900">{rec.number}</b> will be marked <b className="text-red-600">Cancelled</b> and left out of totals and reports.</p> }
      : { tone: 'green', title: 'Reinstate this bill?', confirmLabel: 'Yes, reinstate', message: <p>Bill <b className="text-slate-900">{rec.number}</b> will be active again and its status will follow its payments.</p> });
    if (!ok) return;
    try { await setDocStatus(rec.id, cancelling ? 'Cancelled' : 'Unpaid'); } catch (e) { fail(e, 'Could not change the bill'); }
  };
  const changeStatus = async (s: string) => {
    if (s === rec.status) return;
    const ok = await ask({
      tone: statusTone(s), title: `Change status to ${s}?`, confirmLabel: `Yes, mark ${s}`,
      message: <p>{cfg.title} <b className="text-slate-900">{rec.number}</b>{name ? <> for <b className="text-slate-900">{name}</b></> : null} will change from <b>{rec.status}</b> to <b>{s}</b>.</p>,
    });
    if (!ok) return;
    try { await setDocStatus(rec.id, s); say(`Status changed to ${s}`); } catch (e) { fail(e, 'Could not change the status'); }
  };

  const showOpts = (cfg.qr && !!co.upi) || !!co.stampId || !!co.signatureId || isBill;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.push(`/docs/${type}`)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200" aria-label="Back to list"><ArrowLeft size={18} /></button>
        <ModuleIcon cfg={cfg} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold" style={{ color: cfg.color }}>{cfg.title}</h1>
          <p className="truncate text-xs text-slate-500"><Hi t={cfg.title} /> · {rec.number} · {fmtDate(rec.docDate)}</p>
        </div>
        {/* status: on its own full-width line on a phone, at the right on bigger screens */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 sm:hidden">Status <span lang="hi" className="font-normal">· स्थिति</span></span>
          {isBill ? <StatusBadge status={calc.status} /> : (
            <select aria-label="Status" value={rec.status} onChange={(e) => changeStatus(e.target.value)} className="min-h-[40px] flex-1 rounded-xl border-[1.5px] border-slate-500 bg-white px-2 py-2 text-sm font-semibold hover:border-slate-700 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:flex-none">
              {cfg.statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>
      <p className="px-1 text-xs text-slate-400">Created by {rec.createdByName || 'unknown'}{rec.updatedByName && rec.rev && rec.rev > 1 ? ` · last edited by ${rec.updatedByName}` : ''}</p>

      {/* actions near the top (not stuck to the bottom, the app menu is there on phones) */}
      <div className="flex gap-2">
        <button onClick={download} disabled={busy} className="btn-primary flex-1"><Download size={18} />{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button onClick={share} disabled={busy} className="btn-ghost w-12 px-0 text-emerald-600 sm:w-auto sm:px-4" aria-label="Share on WhatsApp"><MessageCircle size={20} /><span className="hidden sm:inline">WhatsApp</span></button>
        <Link href={`/docs/${type}/edit?id=${rec.id}`} className="btn-ghost w-12 px-0 sm:w-auto sm:px-4" aria-label="Edit"><Pencil size={18} /><span className="hidden sm:inline">Edit</span></Link>
      </div>

      {isBill && calc.money && (
        <section className="card p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xs text-slate-500">Total</p><p className="font-bold">{inr(calc.money.total)}</p></div>
            <div><p className="text-xs text-slate-500">Received</p><p className="font-bold text-emerald-700">{inr(calc.money.paid)}</p></div>
            <div><p className="text-xs text-slate-500">Balance</p><p className="font-bold text-amber-700">{inr(calc.money.balance)}</p></div>
          </div>
          {calc.money.balance > 0 && rec.status !== 'Cancelled' && <button onClick={() => setPay(true)} className="btn-primary mt-3 w-full"><Wallet size={18} />Record payment</button>}
        </section>
      )}

      <DocView rec={rec} cfg={cfg} docs={all} home={co.state} branch={branch} terms={terms} />

      {showOpts && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">PDF options</h2>
          <div className="space-y-2 text-sm text-slate-700">
            {(co.stampId || co.signatureId) && <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={opts.stamp} onChange={(e) => setOpts({ ...opts, stamp: e.target.checked })} />Add stamp &amp; signature</label>}
            {cfg.qr && !!co.upi && <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={opts.qr} onChange={(e) => setOpts({ ...opts, qr: e.target.checked })} />Add UPI QR code</label>}
            {isBill && <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={opts.watermark} onChange={(e) => setOpts({ ...opts, watermark: e.target.checked })} />PAID / UNPAID watermark</label>}
          </div>
        </section>
      )}

      {(CONVERT[type]?.length ?? 0) > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Create from this</h2>
          <div className="flex flex-wrap gap-2">
            {CONVERT[type].map((t) => <Link key={t} href={`/docs/${t}/new?from=${rec.id}`} className="btn-ghost min-h-[40px] text-brand-700">{BY_SLUG[t].title}</Link>)}
          </div>
        </section>
      )}

      <DocHistory docId={rec.id} stamp={`${rec.rev}-${all.length}`} />

      <div className="grid grid-cols-2 gap-3">
        <button onClick={duplicate} disabled={busy} className="btn-ghost"><Copy size={16} />Duplicate</button>
        {isBill ? <button onClick={toggleCancel} className="btn-ghost">{rec.status === 'Cancelled' ? <><RotateCcw size={16} />Reinstate</> : <><Ban size={16} />Cancel bill</>}</button> : <span />}
        <button onClick={remove} className="btn-danger col-span-2"><Trash2 size={16} />Move to recycle bin</button>
      </div>

      <PaymentSheet bill={isBill ? rec : null} open={pay} onClose={() => setPay(false)} onDone={(r) => say(`Payment recorded (${r.number})`)} />
      {confirmDialog}
      <Toast msg={toast} />
    </div>
  );
}

export default function DocDetail() {
  return <Suspense fallback={null}><Detail /></Suspense>;
}
