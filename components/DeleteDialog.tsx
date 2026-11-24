'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Trash2, TriangleAlert } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { BY_SLUG } from '@/lib/config';
import { ApiFail, softDelete, useAllDocs } from '@/lib/store';

const QUICK = ['Duplicate entry', 'Wrong details', 'Customer cancelled', 'Test entry', 'Made again with correct details'];

/**
 * Delete in two steps: 1) write why, 2) "Are you sure?". The reason is saved and shown in the recycle bin.
 * `const [askDelete, deleteDialog] = useDeleteDoc();` then `await askDelete(doc)` (true when deleted), render `{deleteDialog}` once.
 */
export function useDeleteDoc(): [(d: DocRecord) => Promise<boolean>, React.ReactNode] {
  const all = useAllDocs();
  const [cur, setCur] = useState<{ doc: DocRecord; resolve: (ok: boolean) => void } | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const askDelete = useCallback((doc: DocRecord) => new Promise<boolean>((resolve) => { setReason(''); setErr(''); setStep(1); setBusy(false); setCur({ doc, resolve }); }), []);
  const close = useCallback((ok: boolean) => setCur((c) => { c?.resolve(ok); return null; }), []);
  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [cur, busy, close]);

  if (!cur) return [askDelete, null];
  const { doc } = cur;
  const cfg = BY_SLUG[doc.type];
  const name = doc.data[cfg?.party ?? 'customerName'] || '';
  const linked = doc.type === 'bill' ? all.filter((d) => d.type === 'receipt' && d.data.againstId === doc.id).length : 0;
  const next = () => {
    if (reason.trim().length < 3) { setErr('Please write a reason (at least 3 letters)'); return; }
    setErr(''); setStep(2);
  };
  const confirm = async () => {
    setBusy(true);
    try { await softDelete(doc.id, reason.trim()); close(true); }
    catch (e) { setErr(e instanceof ApiFail ? e.message : 'Could not delete. Please try again.'); setBusy(false); setStep(1); }
  };

  const dialog = (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4" onClick={() => !busy && close(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="del-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Step {step} of 2</p>
        {step === 1 ? (
          <>
            <h2 id="del-title" className="text-lg font-bold text-slate-900">Why delete {doc.number}? <span lang="hi" className="block text-sm font-normal text-slate-500">क्यों हटा रहे हैं?</span></h2>
            <p className="mt-1 text-sm text-slate-600">{cfg?.title}{name ? ` · ${name}` : ''}. The reason is kept in the recycle bin.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} type="button" onClick={() => { setReason(q); setErr(''); }} className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${reason === q ? 'bg-red-50 text-red-700 ring-red-300' : 'bg-white text-slate-700 ring-slate-300'}`}>{q}</button>
              ))}
            </div>
            <textarea autoFocus rows={3} maxLength={300} className={`input mt-3 ${err ? 'border-red-500 ring-2 ring-red-100' : ''}`} placeholder="Write the reason…" value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} />
            {err && <p className="mt-1 text-xs font-medium text-red-600">{err}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => close(false)}>Cancel</button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={next}>Next</button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600"><TriangleAlert size={30} /></span>
            <h2 id="del-title" className="mt-3 text-lg font-bold text-slate-900">Are you sure you want to delete?</h2>
            <p lang="hi" className="text-sm text-slate-500">क्या आप सच में हटाना चाहते हैं?</p>
            <p className="mt-2 text-sm text-slate-600"><b className="text-slate-900">{doc.number}</b>{name ? ` (${name})` : ''} will go to the recycle bin. It can be restored within 30 days.</p>
            <p className="mt-2 rounded-xl bg-slate-50 p-2 text-sm text-slate-700">Reason: <b>{reason.trim()}</b></p>
            {linked > 0 && <p className="mt-2 text-sm text-amber-700">This bill has {linked} receipt(s). They stay, but will no longer be linked to a live bill.</p>}
            {err && <p className="mt-2 text-xs font-medium text-red-600">{err}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="btn-ghost" disabled={busy} onClick={() => setStep(1)}><ArrowLeft size={16} />Back</button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={confirm}><Trash2 size={16} />{busy ? 'Deleting…' : 'Yes, delete'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  return [askDelete, dialog];
}
