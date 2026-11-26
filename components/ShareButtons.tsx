'use client';
import { useState } from 'react';
import { Loader2, Mail, MessageCircle } from 'lucide-react';
import type { DocRecord } from '@/lib/types';
import { BY_SLUG } from '@/lib/config';
import { api } from '@/lib/api';
import { docCalc } from '@/lib/ledger';
import { fmtDate, fmtPhone, inrPdf } from '@/lib/format';
import { phoneDigits } from '@/lib/validate';
import { useAllDocs, useBranches, useCompanyFor } from '@/lib/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const phoneOf = (d: DocRecord) => d.data.customerPhone || d.data.payeePhone || d.data.consignorPhone || d.data.consigneePhone || '';
export const emailOf = (d: DocRecord) => (d.data.customerEmail || d.data.email || '').trim();

/**
 * WhatsApp / email share for one document. A read-only PDF link (signed, 90 days) is made on the server,
 * then the message opens addressed only to the mobile number / email saved on the document.
 */
export default function ShareButtons({ rec, onDone, onError, compact = false }: { rec: DocRecord; onDone?: (m: string) => void; onError?: (m: string) => void; compact?: boolean }) {
  const all = useAllDocs();
  const branches = useBranches();
  const companyFor = useCompanyFor();
  const [busy, setBusy] = useState<'' | 'wa' | 'mail'>('');
  const cfg = BY_SLUG[rec.type];
  const digits = phoneDigits(phoneOf(rec));
  const waNumber = digits.length === 10 ? '91' + digits : digits.length === 12 && digits.startsWith('91') ? digits : '';
  const email = EMAIL_RE.test(emailOf(rec)) ? emailOf(rec) : '';
  if (!cfg) return null;

  const message = (link: string) => {
    const co = companyFor(rec.branchId);
    const br = branches.find((b) => b.id === rec.branchId);
    const calc = docCalc(rec, cfg, all, co.state);
    const name = rec.data.customerName || rec.data[cfg.party ?? 'customerName'] || 'Sir/Madam';
    const money = calc.total > 0 && !calc.money?.hideTotal ? ` for ${inrPdf(calc.total)}` : '';
    const due = rec.type === 'bill' && calc.balance && calc.balance > 0 ? `\nBalance due: ${inrPdf(calc.balance)}` : '';
    const phone = br?.phone || co.phone;
    return [
      `Hello ${name},`,
      `Thank you for choosing ${co.name || 'us'}. Your ${cfg.title} ${rec.number} dated ${fmtDate(rec.docDate)}${money} is ready.${due}`,
      `View / download PDF: ${link}`,
      phone ? `For any help, call ${fmtPhone(phone)}.` : '',
      `- ${co.name}${br ? ', ' + br.name : ''}`,
    ].filter(Boolean).join('\n');
  };

  const linkFor = async () => {
    const r = await api<{ path: string }>(`/api/docs/${rec.id}/share-link`, { body: {} });
    return window.location.origin + r.path;
  };

  const viaWhatsApp = async () => {
    if (!waNumber) return;
    // open the tab now (inside the tap) so the browser does not block it, then point it at WhatsApp
    const tab = window.open('', '_blank');
    setBusy('wa');
    try {
      const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message(await linkFor()))}`;
      if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url;
      onDone?.(`WhatsApp opened for ${fmtPhone(digits)}`);
    } catch (e) {
      tab?.close();
      onError?.((e as Error).message || 'Could not make the PDF link');
    } finally { setBusy(''); }
  };

  const viaEmail = async () => {
    if (!email) return;
    setBusy('mail');
    try {
      const co = companyFor(rec.branchId);
      const subject = `${cfg.title} ${rec.number} - ${co.name}`;
      window.location.href = `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message(await linkFor()))}`;
      onDone?.(`Email opened for ${email}`);
    } catch (e) {
      onError?.((e as Error).message || 'Could not make the PDF link');
    } finally { setBusy(''); }
  };

  const base = compact ? 'btn px-3' : 'btn';
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={viaWhatsApp} disabled={!waNumber || !!busy} title={waNumber ? `Send to ${fmtPhone(digits)}` : 'Add the customer mobile number first'}
        className={`${base} bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500`}>
        {busy === 'wa' ? <Loader2 size={17} className="animate-spin" /> : <MessageCircle size={17} />}WhatsApp
      </button>
      <button type="button" onClick={viaEmail} disabled={!email || !!busy} title={email ? `Send to ${email}` : 'Add the customer email first'}
        className={`${base} bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-500`}>
        {busy === 'mail' ? <Loader2 size={17} className="animate-spin" /> : <Mail size={17} />}Email
      </button>
      {(!waNumber || !email) && !compact && (
        <p className="col-span-2 text-[11px] text-slate-500">{!waNumber && !email ? 'Add the customer mobile and email in Edit to share.' : !waNumber ? 'Add the customer mobile number in Edit to share on WhatsApp.' : 'Add the customer email in Edit to share by email.'}</p>
      )}
    </div>
  );
}
