'use client';
import Link from 'next/link';
import type { Branch, DocRecord, Field, ModuleConfig } from '@/lib/types';
import { docCalc, receiptsFor } from '@/lib/ledger';
import { lineAmount, num, summary, validRows } from '@/lib/calc';
import { readGoods } from '@/lib/goods';
import { amountInWords, fmtDate, fmtPhone, inr } from '@/lib/format';
import { isVisible } from '@/lib/fields';

const show = (f: Field, v: string) => (f.type === 'check' ? (v === '1' ? 'Yes' : 'No') : f.type === 'tel' ? fmtPhone(v) : f.type === 'date' ? fmtDate(v) : f.money ? inr(num(v)) : v);

export default function DocView({ rec, cfg, docs, home, branch, terms }: { rec: DocRecord; cfg: ModuleConfig; docs: DocRecord[]; home?: string; branch?: Branch; terms: string[] }) {
  const cols = cfg.columns;
  const rows = validRows(rec.items);
  const calc = docCalc(rec, cfg, docs, home);
  const sm = summary({ items: rows }, cfg);
  const defRate = num(rec.data.gstRate);
  const receipts = rec.type === 'bill' ? receiptsFor(rec, docs) : [];
  const againstBill = rec.type === 'receipt' && rec.data.againstId ? docs.find((d) => d.id === rec.data.againstId) : undefined;
  const totalLabel = cfg.slug === 'receipt' ? 'Amount received' : 'Total';
  const lines = calc.lines.length ? calc.lines : calc.total > 0 ? [{ label: totalLabel, value: calc.total, bold: true }] : [];

  if (cfg.letter) {
    const d = rec.data;
    return (
      <section className="card space-y-3 p-5 text-sm">
        <p className="text-xs text-slate-500">Ref: {rec.number} · {fmtDate(rec.docDate)}</p>
        <div><p>To,</p><p className="font-semibold">{d.toName}</p><p className="whitespace-pre-line">{d.toAddress}</p></div>
        <p className="font-semibold">Subject: {d.subject}</p>
        <p className="whitespace-pre-line leading-relaxed">{d.body}</p>
        <div className="pt-3"><p>Yours faithfully,</p>{d.signName && <p className="mt-6 font-semibold">{d.signName}</p>}{d.signDesignation && <p>{d.signDesignation}</p>}</div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {branch && <p className="px-1 text-xs text-slate-500">Branch: <b className="text-slate-700">{branch.name}</b></p>}

      {cfg.sections.map((s) => {
        if (s.print === false) return null; // payment / insurance boxes appear in the totals instead
        const fields = s.fields.filter((f) => f.type !== 'bill' && rec.data[f.key] && isVisible(f, rec.data));
        if (!fields.length) return null;
        return (
          <section key={s.title} className="card p-4">
            <h2 className="mb-3 font-semibold text-slate-900">{s.title}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {fields.map((f) => (
                <div key={f.key} className={f.type === 'textarea' || !f.half ? 'col-span-2' : ''}>
                  <dt className="text-xs text-slate-500">{f.label}</dt>
                  <dd className="whitespace-pre-line break-words font-medium text-slate-900">
                    {f.key === 'againstDoc' && againstBill ? <Link className="text-brand-700 underline" href={`/docs/bill/view?id=${againstBill.id}`}>{rec.data[f.key]}</Link> : show(f, rec.data[f.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      {cfg.goods && readGoods(rec.data).length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Items list ({readGoods(rec.data).length})</h2>
          <ol className="divide-y divide-slate-100 text-sm">
            {readGoods(rec.data).map((r, i) => (
              <li key={i} className="flex items-start gap-3 py-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{i + 1}</span>
                <span className="min-w-0 flex-1"><span className="font-medium text-slate-900">{r.description || '—'}</span>{r.remarks && <span className="block text-xs text-slate-500">{r.remarks}</span>}</span>
                <span className="shrink-0 text-right font-semibold text-slate-700">× {r.qty || 1}{num(r.value) > 0 && <span className="block text-xs font-normal text-slate-500">{inr(num(r.value))}</span>}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {cols && rows.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold text-slate-900">{cfg.itemsTitle ?? 'Items'}</h2>
          <ul className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const rate = (r.gst ?? '') !== '' ? num(r.gst) : defRate;
              const meta = cfg.money
                ? [`${r.qty} ${r.unit || ''} × ${inr(num(r.rate))}`.replace('  ', ' '), rate > 0 ? `GST ${rate}%` : '', r.hsn ? `SAC ${r.hsn}` : ''].filter(Boolean).join('  ·  ')
                : cols.slice(1).filter((c) => r[c.key]).map((c) => `${c.label}: ${r[c.key]}`).join('  ·  ');
              return (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{i + 1}. {r.description}</p>
                    <p className="text-xs text-slate-500">{meta}</p>
                  </div>
                  {cfg.money && <span className="shrink-0 font-semibold">{inr(lineAmount(r))}</span>}
                </li>
              );
            })}
          </ul>
          {sm.length > 0 && <p className="mt-2 border-t border-slate-100 pt-2 text-sm font-medium text-slate-600">{sm.map(([l, v]) => `${l}: ${v}`).join('  ·  ')}</p>}
        </section>
      )}

      {lines.length > 0 && (
        <section className="card p-4">
          <dl className="space-y-1.5 text-sm">
            {lines.map((ln, i) => (
              <div key={i} className={`flex justify-between ${ln.bold ? 'border-t border-slate-100 pt-2 text-base font-bold text-brand-800' : ''}`}>
                <dt>{ln.label}</dt><dd className="whitespace-nowrap">{ln.text ?? `${ln.value < 0 ? '- ' : ''}${inr(Math.abs(ln.value))}`}</dd>
              </div>
            ))}
          </dl>
          {calc.total > 0 && <p className="mt-3 text-xs text-slate-500">{amountInWords(calc.total)}</p>}
          {!!calc.money?.notes?.length && <p className="mt-1 text-xs text-slate-600">{calc.money.notes.join(' · ')}</p>}
          {calc.money?.hideTotal && <p className="mt-1 text-xs font-medium text-amber-700">The total is hidden on the PDF (Payment details › Total amount in PDF).</p>}
        </section>
      )}

      {receipts.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Payments received</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {receipts.map((r) => (
              <li key={r.id}>
                <Link href={`/docs/receipt/view?id=${r.id}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{r.number}<span className="block text-xs text-slate-500">{fmtDate(r.docDate)} · {r.data.paymentMode}</span></span>
                  <span className="font-semibold">{inr(num(r.data.amount))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rec.data.notes && <section className="card p-4 text-sm"><h2 className="mb-1 font-semibold text-slate-900">Note</h2><p className="whitespace-pre-line text-slate-700">{rec.data.notes}</p></section>}
      {terms.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold text-slate-900">Terms &amp; conditions</h2>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">{terms.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </section>
      )}
    </div>
  );
}
