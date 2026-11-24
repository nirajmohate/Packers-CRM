import type { Branch, Company, DocRecord, Field, ModuleConfig } from './types';
import { lineAmount, num, summary, validRows } from './calc';
import { docCalc } from './ledger';
import { isVisible } from './fields';
import { amountInWords, fmtDate, fmtPhone, inrPdf } from './format';
import { readGoods } from './goods';
import { upiAmount, upiUri } from './upi';

const BRAND: [number, number, number] = [26, 100, 208];
const LIGHT: [number, number, number] = [227, 240, 254];
const GRID: [number, number, number] = [208, 220, 236];
const W = 210;
const M = 12;
const clean = (t: string) => t.replace(/₹/g, 'Rs.');

export interface PdfOpts { stamp: boolean; qr: boolean; watermark: boolean }
export interface PdfImages { logo?: string; logoRatio?: number; stamp?: string; signature?: string }
export interface PdfCtx { company: Company; images: PdfImages; branch?: Branch; docs: DocRecord[]; terms: string[]; opts: PdfOpts }

function fieldValue(f: Field, v: string) {
  if (f.type === 'check') return v === '1' ? 'Yes' : 'No';
  if (f.type === 'date') return fmtDate(v);
  if (f.type === 'tel') return fmtPhone(v); // +91 98765 43210
  if (f.money) return inrPdf(num(v));
  return v;
}

const sign = (v: number) => (v < 0 ? '- ' : '') + inrPdf(Math.abs(v));

export async function buildPdf(rec: DocRecord, cfg: ModuleConfig, ctx: PdfCtx) {
  const { company: co, images, branch, docs, opts } = ctx;
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const calc = docCalc(rec, cfg, docs, co.state);
  let y = M;
  const lastY = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensure = (h: number, limit = 285) => { if (y + h > limit) { pdf.addPage(); y = M; } };

  /* ----- letterhead ----- */
  let tx = M;
  if (images.logo) {
    try {
      const ratio = images.logoRatio || co.logoRatio || 1;
      const w = Math.min(18 * ratio, 40);
      const h = w / ratio; // keep the logo's shape when it is wider than the space
      pdf.addImage(images.logo, 'PNG', M, y, w, h);
      tx = M + w + 4;
    } catch { /* ignore a bad logo */ }
  }
  pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...BRAND);
  pdf.text(co.name || 'Company name', tx, y + 6);
  let ty = y + 11;
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(85);
  const addr = branch?.address || co.address;
  const phone = branch?.phone || co.phone;
  const lines = [
    co.tagline,
    addr,
    [phone && `Mob: ${fmtPhone(phone)}`, co.email].filter(Boolean).join('   |   '),
    [co.gstin && `GSTIN: ${co.gstin}`, co.pan && `PAN: ${co.pan}`, branch && `Branch: ${branch.name}`].filter(Boolean).join('   |   '),
  ].filter(Boolean);
  lines.forEach((t) => (pdf.splitTextToSize(t, W - M - tx) as string[]).forEach((s) => { pdf.text(s, tx, ty); ty += 4; }));
  y = Math.max(ty, y + 19) + 1;
  pdf.setDrawColor(...BRAND).setLineWidth(0.6).line(M, y, W - M, y);
  y += 4;

  /* ----- letter layout ----- */
  if (cfg.letter) {
    pdf.setTextColor(30).setFont('helvetica', 'normal').setFontSize(10);
    pdf.text(`Ref: ${rec.number}`, M, y + 3);
    pdf.text(`Date: ${fmtDate(rec.docDate)}`, W - M, y + 3, { align: 'right' });
    y += 12;
    const d = rec.data;
    const block = (text: string, bold = false, size = 10.5) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(30);
      (pdf.splitTextToSize(text, W - 2 * M) as string[]).forEach((s) => { ensure(6); pdf.text(s, M, y); y += 5.2; });
    };
    block('To,');
    if (d.toName) block(d.toName, true);
    if (d.toAddress) block(d.toAddress);
    y += 3;
    if (d.subject) block(`Subject: ${d.subject}`, true);
    y += 3;
    (d.body || '').split(/\n/).forEach((p) => { if (!p.trim()) { y += 3; return; } block(p); y += 1; });
    y += 6;
    ensure(55);
    block('Yours faithfully,');
    y += 4;
    drawSignature(pdf, co, images, opts.stamp, W - M - 60, y);
    y += 22;
    if (d.signName) block(d.signName, true);
    if (d.signDesignation) block(d.signDesignation);
    block(co.name);
    footer(pdf, rec);
    return pdf;
  }

  /* ----- title + meta ----- */
  const gstBill = rec.type === 'bill' && !!co.gstin && (calc.money?.gst ?? 0) > 0;
  const title = gstBill ? 'TAX INVOICE' : cfg.title.toUpperCase();
  pdf.setFillColor(...BRAND).rect(M, y, W - 2 * M, 8, 'F');
  pdf.setTextColor(255).setFont('helvetica', 'bold').setFontSize(11);
  pdf.text(title, W / 2, y + 5.6, { align: 'center' });
  y += 12;
  pdf.setTextColor(30).setFontSize(9.5);
  pdf.text(`No: ${rec.number}`, M, y);
  pdf.text(`Date: ${fmtDate(rec.docDate)}`, W - M, y, { align: 'right' });
  y += 3;

  /* ----- sections ----- */
  const lab = (t: string): object => ({ content: clean(t), styles: { fontStyle: 'bold' as const, textColor: [90, 90, 90] as [number, number, number] } });
  for (const sec of cfg.sections) {
    if (sec.print === false) continue; // payment / insurance boxes are shown in the totals instead
    const fields = sec.fields.filter((f) => f.type !== 'bill' && rec.data[f.key] && isVisible(f, rec.data));
    if (!fields.length) continue;
    const body: object[][] = [];
    for (let i = 0; i < fields.length; ) {
      const f = fields[i];
      const g = fields[i + 1];
      if (f.type !== 'textarea' && g && g.type !== 'textarea') {
        body.push([lab(f.label), fieldValue(f, rec.data[f.key]), lab(g.label), fieldValue(g, rec.data[g.key])] as object[]);
        i += 2;
      } else {
        body.push([lab(f.label), { content: fieldValue(f, rec.data[f.key]), colSpan: 3 }]);
        i += 1;
      }
    }
    autoTable(pdf, {
      startY: y, margin: { left: M, right: M }, theme: 'grid', body,
      head: [[{ content: sec.title, colSpan: 4, styles: { fillColor: LIGHT, textColor: BRAND, fontStyle: 'bold' } }]],
      styles: { fontSize: 8.5, cellPadding: 1.7, lineColor: GRID, lineWidth: 0.2, textColor: 30 },
      columnStyles: { 0: { cellWidth: 34 }, 2: { cellWidth: 34 } },
    });
    y = lastY() + 3;
  }

  /* ----- household items list (quotation / bill) ----- */
  const goods = cfg.goods ? readGoods(rec.data) : [];
  if (goods.length) {
    const withRemarks = goods.some((r) => (r.remarks || '').trim());
    const withValue = goods.some((r) => num(r.value) > 0);
    const head = ['#', 'Item / particulars', 'Qty', ...(withValue ? ['Value'] : []), ...(withRemarks ? ['Remarks'] : [])];
    const body = goods.map((r, i) => [String(i + 1), r.description, r.qty || '', ...(withValue ? [num(r.value) ? inrPdf(num(r.value)) : ''] : []), ...(withRemarks ? [r.remarks || ''] : [])]);
    if (withValue) body.push(['', 'Total value', '', inrPdf(goods.reduce((a, r) => a + num(r.value), 0)), ...(withRemarks ? [''] : [])]);
    autoTable(pdf, {
      startY: y, margin: { left: M, right: M }, theme: 'grid',
      head: [[{ content: `Items list (${goods.length})`, colSpan: head.length, styles: { fillColor: LIGHT, textColor: BRAND, fontStyle: 'bold' } }], head],
      body,
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'right', cellWidth: 18 }, ...(withValue ? { 3: { halign: 'right', cellWidth: 30 } } : {}) },
      headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: GRID, lineWidth: 0.2, textColor: 30 },
    });
    y = lastY() + 3;
  }

  /* ----- items ----- */
  if (cfg.columns) {
    const cols = cfg.columns;
    const rows = validRows(rec.items);
    if (rows.length) {
      const defRate = num(rec.data.gstRate);
      const effRate = (r: Record<string, string>) => ((r.gst ?? '') !== '' ? num(r.gst) : defRate);
      let head: string[];
      let body: string[][];
      let right: number[];
      if (cfg.money) {
        const showHsn = rows.some((r) => (r.hsn || '').trim());
        const showGst = rows.some((r) => effRate(r) > 0);
        head = ['#', 'Description', ...(showHsn ? ['HSN/SAC'] : []), 'Qty', 'Rate', ...(showGst ? ['GST %'] : []), 'Amount'];
        body = rows.map((r, i) => [String(i + 1), r.description, ...(showHsn ? [r.hsn || ''] : []), `${r.qty || ''} ${r.unit || ''}`.trim(), inrPdf(num(r.rate)), ...(showGst ? [String(effRate(r))] : []), inrPdf(lineAmount(r))]);
        const n = head.length;
        right = showGst ? [n - 4, n - 3, n - 2, n - 1] : [n - 3, n - 2, n - 1];
        right = right.filter((i) => head[i] !== 'HSN/SAC' && head[i] !== 'Description');
      } else {
        head = ['#', ...cols.map((c) => clean(c.label))];
        body = rows.map((r, i) => [String(i + 1), ...cols.map((c) => r[c.key] || '')]);
        right = cols.map((c, i) => (c.type === 'number' ? i + 1 : -1)).filter((i) => i >= 0);
      }
      const columnStyles: Record<number, { halign: 'right' | 'center' }> = { 0: { halign: 'center' } };
      right.forEach((i) => (columnStyles[i] = { halign: 'right' }));
      autoTable(pdf, {
        startY: y, margin: { left: M, right: M }, theme: 'grid', body, columnStyles,
        head: [[{ content: cfg.itemsTitle || 'Items', colSpan: head.length, styles: { fillColor: LIGHT, textColor: BRAND, fontStyle: 'bold' } }], head],
        headStyles: { fillColor: BRAND, textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: GRID, lineWidth: 0.2, textColor: 30 },
      });
      y = lastY() + 3;
      const sm = summary({ items: rows }, cfg);
      if (sm.length) {
        ensure(8);
        pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(30);
        pdf.text(sm.map(([t, v]) => `${t}: ${v}`).join('     '), M, y + 2);
        y += 6;
      }
    }
  }

  /* ----- GST summary ----- */
  const m = calc.money;
  const hideTotal = !!m?.hideTotal; // quotation: "Total amount in PDF: Hide"
  if (m && m.gst > 0 && !hideTotal && m.gstMode !== 'rateOnly') { // "GST % Show & GST Charge Hide" prints no GST amounts
    ensure(10 + m.tax.length * 6);
    const head = m.igst ? ['Tax rate', 'Taxable value', 'IGST', 'Total tax'] : ['Tax rate', 'Taxable value', 'CGST', 'SGST', 'Total tax'];
    const body = m.tax.filter((t) => t.rate > 0).map((t) => (m.igst
      ? [`${t.rate}%`, inrPdf(t.taxable), inrPdf(t.gst), inrPdf(t.gst)]
      : [`${t.rate}%`, inrPdf(t.taxable), inrPdf(t.cgst), inrPdf(t.sgst), inrPdf(t.gst)]));
    autoTable(pdf, {
      startY: y, margin: { left: M, right: M }, theme: 'grid', head: [head], body,
      headStyles: { fillColor: LIGHT, textColor: BRAND, fontSize: 8 }, styles: { fontSize: 8, cellPadding: 1.4, lineColor: GRID, lineWidth: 0.2, textColor: 30 },
      columnStyles: Object.fromEntries(head.map((_, i) => [i, { halign: i === 0 ? 'left' : 'right' }])) as never,
    });
    y = lastY() + 4;
  }

  /* ----- amounts, with bank details and UPI QR in the free column on the left ----- */
  const totalLabel = cfg.slug === 'receipt' ? 'Amount received' : 'Total';
  const amountLines = hideTotal ? [] : calc.lines.length ? calc.lines : calc.total > 0 ? [{ label: totalLabel, value: calc.total, bold: true }] : [];
  // amount due after discount, advance and payments; null when the UPI ID is missing or not valid
  const qrAmount = upiAmount(rec, cfg, m, calc.status);
  const qrUri = hideTotal ? null : upiUri(co, qrAmount, rec.number);
  const showQr = opts.qr && !!qrUri;
  const bankLines = cfg.bank
    ? [co.bankName && `Bank: ${co.bankName}`, co.accountName && `A/c name: ${co.accountName}`, co.accountNo && `A/c no: ${co.accountNo}`, co.ifsc && `IFSC: ${co.ifsc}`, co.upi && `UPI: ${co.upi}`].filter(Boolean) as string[]
    : [];
  const hasBank = bankLines.length > 0 || showQr;
  const boxW = 86;
  const bx = W - M - boxW;
  const leftW = bx - M - 6;
  const wordLines = calc.total > 0 && !hideTotal ? (pdf.splitTextToSize(amountInWords(calc.total), leftW) as string[]) : [];
  const bankTop = 8 + wordLines.length * 4.2 + 5;
  const leftH = (wordLines.length ? bankTop - 5 : 0) + (hasBank ? (wordLines.length ? 5 : 0) + Math.max(bankLines.length * 4.4 + 6, showQr ? 34 : 0) : 0);

  if (amountLines.length || hasBank) {
    ensure(Math.max(amountLines.length * 7.2 + 4, leftH));
    const startY = y;
    let leftBottom = startY;
    if (wordLines.length) {
      pdf.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(90).text('Amount in words', M, startY + 3);
      pdf.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(30);
      wordLines.forEach((t, i) => pdf.text(t, M, startY + 8 + i * 4.2));
      leftBottom = startY + bankTop - 5;
    }
    if (hasBank) {
      const top = wordLines.length ? startY + bankTop : startY;
      if (bankLines.length) {
        pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BRAND).text('Bank details', M, top);
        pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(40);
        bankLines.forEach((t, i) => (pdf.splitTextToSize(t, leftW - 34) as string[]).slice(0, 1).forEach((ln) => pdf.text(ln, M, top + 5 + i * 4.4)));
      }
      let bottom = top + bankLines.length * 4.4 + 5;
      if (showQr) {
        try {
          const QR = (await import('qrcode')).default;
          const img = await QR.toDataURL(qrUri!, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
          const qx = M + leftW - 28;
          pdf.addImage(img, 'PNG', qx, top - 3, 28, 28);
          pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(70);
          pdf.text(`Scan to pay ${inrPdf(qrAmount)}`, qx + 14, top + 28, { align: 'center' });
          bottom = Math.max(bottom, top + 29);
        } catch { /* skip QR if it cannot be drawn */ }
      }
      leftBottom = Math.max(leftBottom, bottom);
    }
    let rightBottom = startY;
    if (amountLines.length) {
      const rows = amountLines.map((ln) => [
        { content: ln.label, styles: { fontStyle: ln.bold ? 'bold' : 'normal', fillColor: ln.bold ? LIGHT : undefined } },
        { content: ln.text ?? sign(ln.value), styles: { halign: 'right', fontStyle: ln.bold ? 'bold' : 'normal', fillColor: ln.bold ? LIGHT : undefined } },
      ]);
      autoTable(pdf, {
        startY, margin: { left: bx, right: M }, theme: 'plain', body: rows as never,
        styles: { fontSize: 9, cellPadding: 1.5, textColor: 30, lineColor: GRID, lineWidth: 0.2 },
        tableLineColor: GRID, tableLineWidth: 0.2,
      });
      rightBottom = lastY();
    }
    y = Math.max(leftBottom, rightBottom) + 5;
  }

  /* ----- rate per KG, reverse charge, who pays GST ----- */
  if (m?.notes?.length && !hideTotal) {
    ensure(6);
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(60);
    pdf.text(m.notes.join('    |    '), M, y);
    y += 6;
  }

  /* ----- notes + terms ----- */
  if (rec.data.notes) {
    ensure(14);
    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BRAND).text('Note', M, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(50);
    (pdf.splitTextToSize(rec.data.notes, W - 2 * M) as string[]).forEach((s) => { ensure(4); pdf.text(s, M, y); y += 4; });
    y += 2;
  }
  if (ctx.terms.length) {
    y += 2;
    ensure(14);
    pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...BRAND).text('Terms & conditions', M, y);
    y += 4.5;
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(70);
    ctx.terms.forEach((t, i) => {
      (pdf.splitTextToSize(`${i + 1}. ${t}`, W - 2 * M) as string[]).forEach((s) => { ensure(4); pdf.text(s, M, y); y += 3.8; });
    });
    y += 2;
  }

  /* ----- signatures ----- */
  ensure(25, 289);
  y += 21;
  pdf.setDrawColor(120).setLineWidth(0.3);
  pdf.line(M, y, M + 55, y);
  pdf.line(W - M - 55, y, W - M, y);
  pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(60);
  pdf.text(cfg.signLabels[0], M, y + 4);
  pdf.text(cfg.signLabels[1], W - M, y + 4, { align: 'right' });
  if (co.name) pdf.text(`For ${co.name}`, W - M, y - 21, { align: 'right' });
  drawSignature(pdf, co, images, opts.stamp, W - M - 60, y - 17);

  /* ----- watermark + footer ----- */
  const wm = opts.watermark && rec.type === 'bill' ? ({ Paid: ['PAID', [22, 163, 74]], Unpaid: ['UNPAID', [220, 38, 38]], Partial: ['PART PAID', [217, 119, 6]], Cancelled: ['CANCELLED', [100, 100, 100]] } as Record<string, [string, [number, number, number]]>)[calc.status] : undefined;
  if (wm) {
    const n = pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      const g = new (pdf as unknown as { GState: new (o: { opacity: number }) => object }).GState({ opacity: 0.09 });
      (pdf as unknown as { setGState: (g: object) => void }).setGState(g);
      pdf.setFont('helvetica', 'bold').setFontSize(wm[0].length > 6 ? 62 : 92).setTextColor(...wm[1]);
      const a = (35 * Math.PI) / 180;
      const tw = pdf.getTextWidth(wm[0]);
      pdf.text(wm[0], 105 - (tw / 2) * Math.cos(a), 150 + (tw / 2) * Math.sin(a), { angle: 35 });
      (pdf as unknown as { setGState: (g: object) => void }).setGState(new (pdf as unknown as { GState: new (o: { opacity: number }) => object }).GState({ opacity: 1 }));
    }
  }
  footer(pdf, rec);
  return pdf;
}

function drawSignature(pdf: import('jspdf').jsPDF, co: Company, images: PdfImages, on: boolean, x: number, y: number) {
  if (!on) return;
  try {
    if (images.stamp) { const h = 22; const w = Math.min(h * (co.stampRatio || 1), 34); pdf.addImage(images.stamp, 'PNG', x - 2, y - 4, w, h); }
    if (images.signature) { const h = 13; const w = Math.min(h * (co.signRatio || 2), 38); pdf.addImage(images.signature, 'PNG', x + 20, y + 3, w, h); }
  } catch { /* ignore bad images */ }
}

function footer(pdf: import('jspdf').jsPDF, rec: DocRecord) {
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(140).text(`${rec.number}   |   Page ${i} of ${n}`, W / 2, 292, { align: 'center' });
  }
}

export const pdfName = (rec: DocRecord, cfg: ModuleConfig) =>
  `${rec.number.toUpperCase().startsWith(cfg.prefix) ? rec.number : cfg.short + '-' + rec.number}.pdf`.replace(/[^\w.-]+/g, '_');

export async function downloadPdf(rec: DocRecord, cfg: ModuleConfig, ctx: PdfCtx) {
  const pdf = await buildPdf(rec, cfg, ctx);
  pdf.save(pdfName(rec, cfg));
}

/** Opens the phone's share sheet with the PDF attached. Returns false when the browser can't do it. */
export async function sharePdf(rec: DocRecord, cfg: ModuleConfig, ctx: PdfCtx) {
  const pdf = await buildPdf(rec, cfg, ctx);
  const file = new File([pdf.output('blob')], pdfName(rec, cfg), { type: 'application/pdf' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${cfg.title} ${rec.number}` }); } catch { /* user closed the sheet */ }
    return true;
  }
  return false;
}
