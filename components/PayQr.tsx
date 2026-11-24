'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { QrCode, Smartphone } from 'lucide-react';
import type { Company, DocRecord, ModuleConfig } from '@/lib/types';
import type { MoneyCalc } from '@/lib/calc';
import { inr } from '@/lib/format';
import { UPI_SOFT_LIMIT, upiAmount, upiUri } from '@/lib/upi';
import { useSession } from '@/lib/store';

/** "Scan to pay" card on a bill: UPI QR for exactly the amount still due. The same QR is printed on the PDF. */
export default function PayQr({ rec, cfg, money, status, co }: { rec: DocRecord; cfg: ModuleConfig; money?: MoneyCalc; status: string; co: Company }) {
  const user = useSession();
  const amount = upiAmount(rec, cfg, money, status);
  const uri = upiUri(co, amount, rec.number);
  const [img, setImg] = useState('');
  useEffect(() => {
    let stop = false;
    setImg('');
    if (!uri) return;
    import('qrcode').then((m) => m.default.toDataURL(uri, { margin: 1, width: 320, errorCorrectionLevel: 'M' })).then((d) => { if (!stop) setImg(d); }).catch(() => {});
    return () => { stop = true; };
  }, [uri]);

  if (!cfg.qr || amount <= 0) return null;
  if (!uri)
    return (
      <section className="card flex items-start gap-3 border-l-4 border-l-amber-400 p-4 text-sm">
        <QrCode className="mt-0.5 shrink-0 text-amber-500" size={22} />
        <div>
          <p className="font-semibold text-slate-900">Payment QR is off</p>
          <p className="text-slate-600">Add your company&apos;s UPI ID (like <span className="font-mono">cloudpackers@okaxis</span>) in Settings › Bank details. Then a QR for {inr(amount)} appears here and on the PDF.</p>
          {user?.role === 'admin' && <Link href="/settings" className="mt-2 inline-block font-semibold text-brand-700 underline">Open Settings</Link>}
        </div>
      </section>
    );
  return (
    <section className="card flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center">
      <div className="grid h-44 w-44 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img ? <img src={img} alt={`UPI QR to pay ${inr(amount)}`} width={160} height={160} className="h-40 w-40" /> : <QrCode className="text-slate-300" size={60} />}
      </div>
      <div className="min-w-0 flex-1 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Scan to pay · <span lang="hi">स्कैन करके भुगतान करें</span></p>
        <p className="text-2xl font-extrabold text-slate-900">{inr(amount)}</p>
        <p className="text-xs text-slate-500">Balance due after discount, advance and payments received · to <span className="font-mono">{co.upi}</span></p>
        {amount > UPI_SOFT_LIMIT && <p className="mt-1 text-xs text-amber-700">Many banks allow up to ₹1 lakh per UPI payment; the customer may need to pay in parts.</p>}
        <a href={uri} className="btn mt-3 bg-emerald-600 text-white hover:bg-emerald-700 sm:hidden"><Smartphone size={17} />Pay with UPI app</a>
        <p className="mt-2 text-[11px] text-slate-400">After the customer pays, use “Record payment” so the bill shows Paid.</p>
      </div>
    </section>
  );
}
