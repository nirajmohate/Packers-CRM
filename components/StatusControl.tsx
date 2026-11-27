'use client';
import { useCancelReason } from './CancelDialog';
import { useState } from 'react';
import type { DocRecord } from '@/lib/types';
import { BY_SLUG } from '@/lib/config';
import { inr } from '@/lib/format';
import { ApiFail, setDocStatus } from '@/lib/store';
import PaymentSheet from './PaymentSheet';
import { Toast, useConfirm } from './ui';

/** Three colours for every status: red (not paid / rejected / cancelled), green (done / paid / approved), blue (anything in progress). */
export type Tone = 'red' | 'green' | 'blue';
export function toneOf(status: string): Tone {
  const s = (status || '').toLowerCase();
  if (/unpaid|reject|cancel/.test(s)) return 'red';
  if (/paid|approved|booked|filled|complet|deliver|received|packed|done|issued|closed/.test(s)) return 'green';
  return 'blue';
}
/** faint background for a whole list row */
export const ROW_TONE: Record<Tone, string> = { red: 'bg-red-50/80 hover:bg-red-100/70', green: 'bg-emerald-50/80 hover:bg-emerald-100/70', blue: 'bg-sky-50/80 hover:bg-sky-100/70' };
const SELECT_TONE: Record<Tone, string> = {
  red: 'border-red-300 bg-red-50 text-red-700', green: 'border-emerald-300 bg-emerald-50 text-emerald-800', blue: 'border-sky-300 bg-sky-50 text-sky-800',
};

/** Coloured dropdown showing the current status; picking another one calls `onPick`. */
export function StatusSelect({ doc, status, onPick, disabled, wide }: { doc: DocRecord; status: string; onPick: (next: string) => void; disabled?: boolean; wide?: boolean }) {
  const cfg = BY_SLUG[doc.type];
  if (!cfg) return null;
  const options = cfg.slug === 'bill' ? ['Unpaid', 'Partial', 'Paid', 'Cancelled'] : cfg.statuses;
  const list = options.includes(status) ? options : [status, ...options];
  return (
    <select
      aria-label={`Status of ${doc.number}`} value={status} disabled={disabled}
      onChange={(e) => onPick(e.target.value)} onClick={(e) => e.stopPropagation()}
      className={`min-h-[34px] cursor-pointer rounded-full border-[1.5px] py-1 pl-3 pr-8 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 ${SELECT_TONE[toneOf(status)]} ${wide ? 'min-h-[40px] w-full text-sm sm:w-auto' : ''}`}
    >
      {list.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

/**
 * Status changes with a confirmation popup. Bills are special: their status follows their payments,
 * so "Paid" / "Partial" opens Record payment, and "Cancelled" cancels the bill.
 * Returns `change(doc, currentStatus, next, balance?)` and the elements to render once.
 */
export function useStatusChanger(): [(doc: DocRecord, current: string, next: string, balance?: number) => Promise<void>, React.ReactNode, string] {
  const [ask, confirmDialog] = useConfirm();
  const [askCancel, cancelDialog] = useCancelReason();
  const [payFor, setPayFor] = useState<DocRecord | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };

  const change = async (doc: DocRecord, current: string, next: string, balance = 0) => {
    const cfg = BY_SLUG[doc.type];
    if (!cfg || next === current || busy) return;
    const name = doc.data[cfg.party ?? 'customerName'] || '';
    const who = <><b className="text-slate-900">{doc.number}</b>{name ? <> ({name})</> : null}</>;
    let target = next;
    let reason: string | undefined;
    if (next === 'Cancelled') {
      // two steps: the reason, then "Are you sure?"
      const r = await askCancel(doc);
      if (!r) return;
      reason = r;
    } else if (cfg.slug === 'bill') {
      if (current === 'Cancelled') {
        if (!(await ask({ tone: 'blue', title: 'Make this bill active again?', confirmLabel: 'Yes, reinstate', message: <p>Bill {who} will be active again; its status will follow its payments.</p> }))) return;
        target = 'Unpaid';
      } else if (next === 'Paid' || next === 'Partial') {
        if (balance <= 0) { say('This bill is already fully paid.'); return; }
        const ok = await ask({
          tone: 'green', title: next === 'Paid' ? 'Mark this bill paid?' : 'Record a part payment?', confirmLabel: 'Record payment',
          message: <><p>Bill {who} has <b className="text-amber-700">{inr(balance)}</b> due.</p><p className="mt-2 text-xs text-slate-500">A money receipt is saved for the amount you enter, so totals and reports stay correct. {next === 'Paid' ? 'Enter the full balance to mark it Paid.' : ''}</p></>,
        });
        if (ok) setPayFor(doc);
        return;
      } else if (next === 'Unpaid') {
        await ask({ tone: 'blue', title: 'Payments are recorded on this bill', confirmLabel: 'OK', cancelLabel: 'Close', message: <p>To make bill {who} unpaid again, delete its money receipt(s) from the Money Receipt list (with a reason). The status then changes by itself.</p> });
        return;
      }
    } else if (!(await ask({ tone: toneOf(next) === 'red' ? 'red' : toneOf(next) === 'green' ? 'green' : 'blue', title: `Change status to ${next}?`, confirmLabel: `Yes, mark ${next}`, message: <p>{cfg.title} {who} will change from <b>{current}</b> to <b>{next}</b>.</p> }))) return;

    setBusy(doc.id);
    try { await setDocStatus(doc.id, target, reason); say(`${doc.number}: ${target === 'Unpaid' && cfg.slug === 'bill' ? 'active again' : target}`); }
    catch (e) { say(e instanceof ApiFail ? e.message : 'Could not change the status. Please try again.'); }
    finally { setBusy(''); }
  };

  const element = (
    <>
      {confirmDialog}
      {cancelDialog}
      <PaymentSheet bill={payFor} open={!!payFor} onClose={() => setPayFor(null)} onDone={(r) => say(`Payment recorded (${r.number})`)} />
      <Toast msg={toast} />
    </>
  );
  return [change, element, busy];
}
