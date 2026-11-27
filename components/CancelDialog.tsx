'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, TriangleAlert } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { BY_SLUG } from '@/lib/config';

const QUICK = ['Customer cancelled the shifting', 'Customer chose another company', 'Price not agreed', 'Shifting postponed', 'Wrong details, made again'];

/**
 * Cancel in two steps, like delete: 1) write why, 2) "Are you sure?".
 * `const [askCancel, cancelDialog] = useCancelReason();` then `const reason = await askCancel(doc)` (null when the user backs out).
 */
export function useCancelReason(): [(d: DocRecord) => Promise<string | null>, React.ReactNode] {
  const [cur, setCur] = useState<{ doc: DocRecord; resolve: (r: string | null) => void } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const askCancel = useCallback((doc: DocRecord) => new Promise<string | null>((resolve) => { setReason(''); setErr(''); setStep(1); setCur({ doc, resolve }); }), []);
  const close = useCallback((r: string | null) => setCur((c) => { c?.resolve(r); return null; }), []);
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [cur, close]);

  if (!cur) return [askCancel, null];
  const { doc } = cur;
  const cfg = BY_SLUG[doc.type];
  const name = doc.data[cfg?.party ?? 'customerName'] || '';
  const next = () => {
    if (reason.trim().length < 3) { setErr('Please write a reason (at least 3 letters)'); return; }
    setErr(''); setStep(2);
  };

  const dialog = (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" onClick={() => close(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-title" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Step {step} of 2</p>
        {step === 1 ? (
          <>
            <h2 id="cancel-title" className="text-lg font-bold text-slate-900">Why cancel {doc.number}?</h2>
            <p className="mt-1 text-sm text-slate-600">{cfg?.title}{name ? ` · ${name}` : ''}. The reason is shown on the document and kept in the audit log.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} type="button" onClick={() => { setReason(q); setErr(''); }} className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${reason === q ? 'bg-orange-50 text-orange-700 ring-orange-300' : 'bg-white text-slate-700 ring-slate-300'}`}>{q}</button>
              ))}
            </div>
            <textarea autoFocus rows={3} maxLength={300} className={`input mt-3 ${err ? 'border-red-500 ring-2 ring-red-100' : ''}`} placeholder="Write the reason…" value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} />
            {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => close(null)}>Go back</button>
              <button className="btn bg-orange-600 text-white hover:bg-orange-700" onClick={next}>Next</button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-orange-50 text-orange-600"><TriangleAlert size={30} /></span>
            <h2 id="cancel-title" className="mt-3 text-lg font-bold text-slate-900">Are you sure you want to cancel?</h2>
            <p className="mt-2 text-sm text-slate-600"><b className="text-slate-900">{doc.number}</b>{name ? ` (${name})` : ''} will be marked <b className="text-red-600">Cancelled</b>{doc.type === 'bill' ? ' and left out of totals and reports' : ''}. You can change the status back later.</p>
            <p className="mt-2 rounded-xl bg-slate-50 p-2 text-sm text-slate-700">Reason: <b>{reason.trim()}</b></p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={16} />Back</button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => close(reason.trim())}><Ban size={16} />Yes, cancel it</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return [askCancel, dialog];
}
