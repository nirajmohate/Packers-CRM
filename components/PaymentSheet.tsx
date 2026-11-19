'use client';
import { useEffect, useState } from 'react';
import type { DocRecord } from '@/lib/types';
import { billInfo } from '@/lib/ledger';
import { inr, todayISO } from '@/lib/format';
import { num, round2 } from '@/lib/calc';
import { ApiFail, createDoc, useAllDocs, useHomeState } from '@/lib/store';
import { Sheet } from './ui';

/** Records a payment against a bill by creating a Money Receipt linked to it. The server assigns the receipt number. */
export default function PaymentSheet({ bill, open, onClose, onDone }: { bill: DocRecord | null; open: boolean; onClose: () => void; onDone?: (receipt: DocRecord) => void }) {
  const docs = useAllDocs();
  const home = useHomeState();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState('UPI');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const info = bill ? billInfo(bill, docs, home(bill.branchId)) : null;
  const balance = info?.calc.balance ?? 0;
  useEffect(() => {
    if (open && bill) { setAmount(String(balance)); setDate(todayISO()); setMode('UPI'); setRef(''); setErr(''); setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill?.id]);

  if (!bill) return null;

  const submit = async () => {
    const a = round2(num(amount));
    if (a <= 0) return setErr('Enter an amount more than zero');
    if (a > balance + 0.004) return setErr(`Only ${inr(balance)} is due on this bill`);
    if (mode !== 'Cash' && !ref.trim()) return setErr('Enter the transaction ID or cheque number');
    setBusy(true); setErr('');
    try {
      const rec = await createDoc({
        type: 'receipt', branchId: bill.branchId, docDate: date,
        data: {
          customerName: bill.data.customerName || '', customerPhone: bill.data.customerPhone || '', ...(bill.data.customerEmail ? { customerEmail: bill.data.customerEmail } : {}),
          amount: String(a), paymentMode: mode, ...(ref.trim() ? { txnRef: ref.trim() } : {}),
          againstId: bill.id, againstDoc: bill.number, purpose: `Payment against Bill / Invoice ${bill.number}`,
        },
        items: [],
      });
      onDone?.(rec);
      onClose();
    } catch (e) {
      setBusy(false);
      setErr(e instanceof ApiFail ? e.message : 'Could not save the payment');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Record payment">
      <p className="text-sm text-slate-600">{bill.number} · {bill.data.customerName}</p>
      <p className="mb-4 mt-1 text-sm">Balance due: <b className="text-brand-800">{inr(balance)}</b></p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Amount (₹)</label><input className="input" type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} /></div>
        <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label">Mode</label>
          <select className="input" value={mode} onChange={(e) => { setMode(e.target.value); setErr(''); }}>
            {['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Card'].map((m) => <option key={m}>{m}</option>)}
          </select></div>
        {mode !== 'Cash' && <div><label className="label">Transaction ID / cheque no.</label><input className="input" value={ref} onChange={(e) => { setRef(e.target.value); setErr(''); }} /></div>}
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <p className="mt-3 text-xs text-slate-500">A Money Receipt is created automatically and the bill status updates by itself.</p>
      <button onClick={submit} disabled={busy} className="btn-primary mt-4 w-full">{busy ? 'Saving…' : 'Save payment'}</button>
    </Sheet>
  );
}
