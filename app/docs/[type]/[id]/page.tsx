'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Copy, Download, MessageCircle, Pencil, Share2, Trash2 } from 'lucide-react';
import { BY_SLUG, CONVERT } from '@/lib/config';
import { docTotal } from '@/lib/calc';
import { fmtDate, inrPdf, todayISO } from '@/lib/format';
import { removeDoc, saveDoc, uid, nextNumber, useCompany, useDocs, useHydrated } from '@/lib/store';
import { downloadPdf, sharePdf } from '@/lib/pdf';
import DocView from '@/components/DocView';
import { ModuleIcon, Toast } from '@/components/ui';

export default function DocDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const router = useRouter();
  const docs = useDocs();
  const co = useCompany();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const cfg = BY_SLUG[type];
  const rec = docs.find((d) => d.id === id);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  if (!ready) return null;
  if (!cfg || !rec) return <p className="py-10 text-center text-slate-500">Document not found on this device.</p>;

  const total = docTotal(rec, cfg);
  const name = rec.data.customerName || rec.data.payeeName || '';

  const download = async () => {
    setBusy(true);
    try { await downloadPdf(rec, cfg, co); } catch (e) { console.error(e); say('Could not create the PDF. Please try again.'); }
    setBusy(false);
  };

  const share = async () => {
    setBusy(true);
    try {
      const ok = await sharePdf(rec, cfg, co);
      if (!ok) {
        const digits = (rec.data.customerPhone || '').replace(/\D/g, '');
        const phone = digits.length === 10 ? '91' + digits : digits;
        const text = `Hello ${name},\nYour ${cfg.title} ${rec.number}${total ? ` for ${inrPdf(total)}` : ''} from ${co.name} is ready.`;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        say('This browser cannot attach files. Tap Download PDF, then attach it in WhatsApp.');
      }
    } catch (e) { console.error(e); say('Could not share the PDF.'); }
    setBusy(false);
  };

  const duplicate = () => {
    const now = new Date().toISOString();
    const copy = { ...rec, id: uid(), number: nextNumber(cfg, docs), status: cfg.statuses[0], docDate: todayISO(), createdAt: now, updatedAt: now };
    saveDoc(copy);
    router.push(`/docs/${type}/${copy.id}`);
  };

  const remove = () => {
    if (!window.confirm(`Delete ${cfg.title} ${rec.number}? This cannot be undone.`)) return;
    removeDoc(rec.id);
    router.replace(`/docs/${type}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/docs/${type}`)} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200" aria-label="Back to list"><ArrowLeft size={18} /></button>
        <ModuleIcon cfg={cfg} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-slate-900">{cfg.title}</h1>
          <p className="text-xs text-slate-500">{rec.number} · {fmtDate(rec.docDate)}</p>
        </div>
        <select
          aria-label="Status" value={rec.status}
          onChange={(e) => saveDoc({ ...rec, status: e.target.value, updatedAt: new Date().toISOString() })}
          className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm font-semibold"
        >
          {cfg.statuses.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <DocView rec={rec} cfg={cfg} />

      {(CONVERT[type]?.length ?? 0) > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Create from this</h2>
          <div className="flex flex-wrap gap-2">
            {CONVERT[type].map((t) => (
              <Link key={t} href={`/docs/${t}/new?from=${rec.id}`} className="btn-ghost min-h-[40px] text-brand-700">{BY_SLUG[t].title}</Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button onClick={duplicate} className="btn-ghost"><Copy size={16} />Duplicate</button>
        <button onClick={remove} className="btn-danger"><Trash2 size={16} />Delete</button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:left-64">
        <button onClick={download} disabled={busy} className="btn-primary flex-1"><Download size={18} />{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button onClick={share} disabled={busy} className="btn-ghost w-12 px-0 text-emerald-600" aria-label="Share on WhatsApp"><MessageCircle size={20} /></button>
        <button onClick={share} disabled={busy} className="btn-ghost hidden w-12 px-0 sm:inline-flex" aria-label="Share"><Share2 size={18} /></button>
        <Link href={`/docs/${type}/${rec.id}/edit`} className="btn-ghost w-12 px-0" aria-label="Edit"><Pencil size={18} /></Link>
      </div>
      <Toast msg={toast} />
    </div>
  );
}
