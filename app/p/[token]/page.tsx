'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, ExternalLink, FileText, Loader2, Phone, TriangleAlert } from 'lucide-react';
import type { Branch, Company, DocRecord } from '@/lib/types';
import { BY_SLUG } from '@/lib/config';
import { BRAND } from '@/lib/brand';
import { api, ApiFail } from '@/lib/api';
import { docCalc } from '@/lib/ledger';
import { fmtDate, fmtPhone, inr } from '@/lib/format';
import { buildPdf, pdfName } from '@/lib/pdf';

interface Bundle { doc: DocRecord; related: DocRecord[]; branch?: Branch; company: Company; terms: string[]; images: { logo?: string; stamp?: string; signature?: string } }

async function staticImage(path: string) {
  try {
    const b = await (await fetch(path)).blob();
    return await new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = rej; f.readAsDataURL(b); });
  } catch { return undefined; }
}

/** The page a customer opens from a WhatsApp / email link: the document's PDF, read-only. */
export default function SharedPdf() {
  const { token } = useParams<{ token: string }>();
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState('');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('document.pdf');

  useEffect(() => {
    let live = true;
    let made = '';
    (async () => {
      try {
        const data = await api<Bundle>(`/api/public/doc/${encodeURIComponent(token)}`);
        if (!live) return;
        setB(data);
        const cfg = BY_SLUG[data.doc.type];
        if (!cfg) throw new Error('This document cannot be shown.');
        const co = data.company;
        const terms = (data.doc.data.terms !== undefined ? data.doc.data.terms : data.terms.join('\n')).split('\n').map((t) => t.trim()).filter(Boolean);
        const logo = data.images.logo ?? (await staticImage(BRAND.logo));
        const pdf = await buildPdf(data.doc, cfg, {
          company: co, branch: data.branch, docs: [data.doc, ...data.related], terms,
          images: { logo, logoRatio: data.images.logo ? undefined : BRAND.logoRatio, stamp: data.images.stamp, signature: data.images.signature },
          opts: { stamp: co.pdfStamp, qr: co.pdfQr, watermark: co.pdfWatermark },
        });
        made = URL.createObjectURL(pdf.output('blob'));
        if (live) { setUrl(made); setName(pdfName(data.doc, cfg)); }
      } catch (e) {
        if (live) setErr(e instanceof ApiFail || e instanceof Error ? e.message : 'Could not open this document.');
      }
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [token]);

  const cfg = b ? BY_SLUG[b.doc.type] : undefined;
  const calc = b && cfg ? docCalc(b.doc, cfg, [b.doc, ...b.related], b.company.state) : null;
  const phone = b?.branch?.phone || b?.company.phone || '';

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <img src={BRAND.logo} alt="" className="h-12 w-auto rounded-lg bg-white p-1 shadow-sm" />
          <div className="min-w-0"><p className="truncate text-lg font-bold text-slate-900">{b?.company.name || 'Cloud Packers'}</p><p className="truncate text-xs text-slate-500">{b?.company.tagline || 'Packers & Movers'}</p></div>
        </div>
        {err ? (
          <div className="card flex flex-col items-center gap-2 p-6 text-center">
            <TriangleAlert className="text-amber-600" size={32} />
            <p className="font-semibold text-slate-900">Link not available</p>
            <p className="text-sm text-slate-600">{err}</p>
          </div>
        ) : !b || !cfg ? (
          <div className="card flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={18} />Opening your document…</div>
        ) : (
          <div className="card space-y-4 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><FileText size={22} /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{cfg.title}</p>
                <p className="break-all font-bold text-slate-900">{b.doc.number}</p>
                <p className="text-xs text-slate-500">{fmtDate(b.doc.docDate)}{b.doc.data.customerName ? ` · ${b.doc.data.customerName}` : ''}</p>
              </div>
            </div>
            {calc && calc.total > 0 && !calc.money?.hideTotal && (
              <div className="flex items-center justify-between rounded-xl bg-brand-700 px-4 py-3 text-white"><span className="text-sm">Total</span><span className="text-lg font-bold">{inr(calc.total)}</span></div>
            )}
            {!url ? <p className="flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} />Preparing PDF…</p> : (
              <div className="grid gap-2">
                <a href={url} target="_blank" rel="noreferrer" className="btn-primary"><ExternalLink size={17} />Open PDF</a>
                <a href={url} download={name} className="btn-ghost"><Download size={17} />Download PDF</a>
              </div>
            )}
            {phone && <a href={`tel:${phone}`} className="flex items-center justify-center gap-2 text-sm font-semibold text-brand-700"><Phone size={15} />Call us: {fmtPhone(phone)}</a>}
          </div>
        )}
        <p className="text-center text-[11px] text-slate-400">This is a private link for you. Please do not forward it.</p>
      </div>
    </main>
  );
}
