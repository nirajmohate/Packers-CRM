'use client';
import ShareButtons from '@/components/ShareButtons';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Ban, Copy, Download, MessageCircle, Pencil, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { BY_SLUG, CONVERT } from '@/lib/config';
import { docCalc } from '@/lib/ledger';
import { fmtDate, inr, inrPdf, todayISO } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { ApiFail, createDoc, setDocStatus, useAllDocs, useBranches, useCompanyFor, useHydrated, useSession, useTermsFor } from '@/lib/store';
import { loadCompanyImages } from '@/lib/images';
import { downloadPdf, sharePdf, type PdfOpts } from '@/lib/pdf';
import DocView from '@/components/DocView';
import DocHistory from '@/components/DocHistory';
import PaymentSheet from '@/components/PaymentSheet';
import PayQr from '@/components/PayQr';
import { Hi, ModuleIcon, Toast, useConfirm } from '@/components/ui';
import { useDeleteDoc } from '@/components/DeleteDialog';
import { canDelete, canUseType } from '@/lib/roles';
import { StatusSelect, useStatusChanger } from '@/components/StatusControl';

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
  const [askDelete, deleteDialog] = useDeleteDoc();
  const me = useSession();
  const convertTo = (CONVERT[type] ?? []).filter((t) => canUseType(me, t));
  const [changeStatus, statusElements, statusBusy] = useStatusChanger();

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
    // two steps: reason, then "are you sure?" (see components/DeleteDialog)
    if (await askDelete(rec)) router.replace(`/docs/${type}`);
  };
  const toggleCancel = async () => {
    const cancelling = rec.status !== 'Cancelled';
    const ok = await ask(cancelling
      ? { tone: 'red', title: 'Cancel this bill?', confirmLabel: 'Yes, cancel bill', message: <p>Bill <b className="text-slate-900">{rec.number}</b> will be marked <b className="text-red-600">Cancelled</b> and left out of totals and reports.</p> }
      : { tone: 'green', title: 'Reinstate this bill?', confirmLabel: 'Yes, reinstate', message: <p>Bill <b className="text-slate-900">{rec.number}</b> will be active again and its status will follow its payments.</p> });
    if (!ok) return;
    try { await setDocStatus(rec.id, cancelling ? 'Cancelled' : 'Unpaid'); } catch (e) { fail(e, 'Could not change the bill'); }
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
          <StatusSelect wide doc={rec} status={calc.status} disabled={statusBusy === rec.id} onPick={(next) => changeStatus(rec, calc.status, next, calc.balance ?? 0)} />
        </div>
      </div>
      <p className="px-1 text-xs text-slate-400">Created by {rec.createdByName || 'unknown'}{rec.updatedByName && rec.rev && rec.rev > 1 ? ` · last edited by ${rec.updatedByName}` : ''}</p>

      {/* actions near the top (not stuck to the bottom, the app menu is there on phones) */}
      <div className="flex gap-2">
        <button onClick={download} disabled={busy} className="btn-primary flex-1"><Download size={18} />{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button onClick={share} disabled={busy} className="btn-ghost w-12 px-0 text-emerald-600 sm:w-auto sm:px-4" aria-label="Share PDF file"><MessageCircle size={20} /><span className="hidden sm:inline">Share file</span></button>
        <Link href={`/docs/${type}/edit?id=${rec.id}`} className="btn-ghost w-12 px-0 sm:w-auto sm:px-4" aria-label="Edit"><Pencil size={18} /><span className="hidden sm:inline">Edit</span></Link>
      </div>

      <section className="card space-y-2 p-3">
        <p className="text-xs font-semibold text-slate-600">Send to customer <span lang="hi" className="font-normal">· ग्राहक को भेजें</span> <span className="font-normal text-slate-500">— a short message with a PDF link, only to the number / email on this {cfg.title.toLowerCase()}</span></p>
        <ShareButtons rec={rec} onDone={say} onError={say} />
      </section>

      {/* UPI QR for the amount still due (bills / proforma) */}
      <PayQr rec={rec} cfg={cfg} money={calc.money} status={calc.status} co={co} />

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

      {convertTo.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Create from this</h2>
          <div className="flex flex-wrap gap-2">
            {convertTo.map((t) => <Link key={t} href={`/docs/${t}/new?from=${rec.id}`} className="btn-ghost min-h-[40px] text-brand-700">{BY_SLUG[t].title}</Link>)}
          </div>
        </section>
      )}

      <DocHistory docId={rec.id} stamp={`${rec.rev}-${all.length}`} />

      <div className="grid grid-cols-2 gap-3">
        <button onClick={duplicate} disabled={busy} className="btn-ghost"><Copy size={16} />Duplicate</button>
        {isBill ? <button onClick={toggleCancel} className="btn-ghost">{rec.status === 'Cancelled' ? <><RotateCcw size={16} />Reinstate</> : <><Ban size={16} />Cancel bill</>}</button> : <span />}
        {canDelete(me) && <button onClick={remove} className="btn-danger col-span-2"><Trash2 size={16} />Move to recycle bin</button>}
      </div>

      <PaymentSheet bill={isBill ? rec : null} open={pay} onClose={() => setPay(false)} onDone={(r) => say(`Payment recorded (${r.number})`)} />
      {confirmDialog}
      {deleteDialog}
      {statusElements}
      <Toast msg={toast} />
    </div>
  );
}

export default function DocDetail() {
  return <Suspense fallback={null}><Detail /></Suspense>;
}
