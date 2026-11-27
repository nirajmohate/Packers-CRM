import type { Branch, CalcLine, Company, DocRecord, Field, ModuleConfig } from './types';
import { lineAmount, num, summary, validRows } from './calc';
import { docCalc } from './ledger';
import { isVisible } from './fields';
import { amountInWords, fmtDate, fmtPhone, inrPdf } from './format';
import { readGoods } from './goods';
import { upiAmount, upiUri } from './upi';
import { BRAND, SAMPLE_CONTACT } from './brand';
import { loadClientLogos } from './images';

type RGB = [number, number, number];
type Pdf = import('jspdf').jsPDF;

const NAVY: RGB = [11, 84, 158];
const BLUE: RGB = [30, 136, 229];
const INK: RGB = [18, 38, 74];
const SOFT: RGB = [228, 240, 253];
const PALE: RGB = [246, 250, 255];
const LINE: RGB = [184, 210, 238];
const W = 210;
const M = 12;
const LIMIT = 274; // content stops above the footer wave
const TOP2 = 17; // where content starts on page 2 onwards (below the small header)
const clean = (t: string) => t.replace(/₹/g, 'Rs.');

export interface PdfOpts { stamp: boolean; qr: boolean; watermark: boolean }
export interface PdfImages { logo?: string; logoRatio?: number; stamp?: string; signature?: string }
export interface PdfCtx { company: Company; images: PdfImages; branch?: Branch; docs: DocRecord[]; terms: string[]; opts: PdfOpts }

function fieldValue(f: Field, v: string) {
  if (f.type === 'check') return v === '1' ? 'Yes' : 'No';
  if (f.type === 'date') return fmtDate(v);
  if (f.type === 'tel') return fmtPhone(v); // +91 98765 43210
  if (f.money) return inrPdf(num(v));
  return clean(v);
}

const sign = (v: number) => (v < 0 ? '- ' : '') + inrPdf(Math.abs(v));

/** Branch contact for the letterhead. Empty values fall back to the company, then to SAMPLE details (see lib/brand.ts). */
export function contactOf(co: Company, branch?: Branch) {
  const city = branch?.city || branch?.name || '';
  return {
    phone: branch?.phone || co.phone || SAMPLE_CONTACT.phone,
    phone2: branch?.phone ? branch.phone2 || '' : '',
    email: co.email || SAMPLE_CONTACT.email,
    address: branch?.address || co.address || SAMPLE_CONTACT.address(city),
    branch: branch?.name || '',
  };
}

/* ============================================ drawing helpers ============================================ */
/** Light-blue city, road and a delivery truck at the top right of the first page. */
function headerArt(pdf: Pdf, co: Company) {
  pdf.setFillColor(229, 240, 252);
  pdf.lines([[10, -5, 8, -40, 28, -46], [W - 150, 0], [0, 46]], 122, 46, [1, 1], 'F', true);
  pdf.setFillColor(206, 226, 248);
  const blocks: [number, number, number][] = [[136, 14, 6], [143, 22, 7], [151, 11, 5], [157, 28, 8], [166, 17, 6], [173, 25, 7], [181, 13, 6], [188, 21, 8], [197, 16, 6], [203, 26, 7]];
  for (const [x, h, w] of blocks) pdf.rect(x, 42 - h, w, h, 'F');
  pdf.setFillColor(214, 228, 244).rect(128, 42, W - 128, 4, 'F');
  // truck, facing left
  pdf.setFillColor(255, 255, 255).setDrawColor(160, 188, 222).setLineWidth(0.3);
  pdf.roundedRect(159, 16.5, 44, 21.5, 1.2, 1.2, 'FD');
  pdf.setFillColor(...NAVY).rect(159, 35.6, 44, 1.2, 'F');
  const name = (co.name || BRAND.name).trim();
  pdf.setFont('helvetica', 'bolditalic').setFontSize(name.length > 16 ? 6.5 : 8.5).setTextColor(...NAVY);
  pdf.text(name, 181, 28, { align: 'center', maxWidth: 40 });
  pdf.setFillColor(238, 243, 249).setDrawColor(150, 172, 200);
  pdf.lines([[0, -11], [3.2, -4.5], [10.8, 0], [0, 15.5]], 145.5, 38, [1, 1], 'FD', true);
  pdf.setFillColor(88, 128, 176);
  pdf.lines([[2.3, -3.2], [6.2, 0], [0, 5], [-8.5, 0]], 147.2, 27.8, [1, 1], 'F', true);
  pdf.setFillColor(250, 205, 90).rect(145.7, 33, 1.2, 1.6, 'F');
  pdf.setFillColor(70, 80, 95).rect(145, 37.6, 58, 1.6, 'F');
  for (const x of [151, 187.5, 195.5]) {
    pdf.setFillColor(40, 45, 55).circle(x, 40.4, 2.7, 'F');
    pdf.setFillColor(170, 176, 186).circle(x, 40.4, 1.1, 'F');
  }
}

/** First-page letterhead: logo, name, tagline, slogan, art, then the branch contact strip. Returns the next y. */
function letterhead(pdf: Pdf, co: Company, images: PdfImages, branch?: Branch) {
  headerArt(pdf, co);
  let tx = M;
  if (images.logo) {
    try {
      const ratio = images.logoRatio || co.logoRatio || 1;
      const h = 26;
      const w = Math.min(h * ratio, 46);
      pdf.addImage(images.logo, fmtOf(images.logo), M, 9 + (h - w / ratio) / 2, w, w / ratio, 'logo', 'FAST');
      tx = M + w + 4;
      pdf.setDrawColor(...NAVY).setLineWidth(0.5).line(tx, 11, tx, 36);
      tx += 4;
    } catch { /* ignore a bad logo */ }
  }
  const name = (co.name || 'Company name').trim();
  const room = 140 - tx;
  let size = 22;
  pdf.setFont('helvetica', 'bold');
  while (size > 13 && pdf.setFontSize(size).getTextWidth(name) > room) size -= 1;
  const [first, ...rest] = name.split(' ');
  if (rest.length) {
    pdf.setTextColor(...BLUE).text(first, tx, 20);
    const fw = pdf.getTextWidth(first + ' ');
    pdf.setTextColor(...INK).text(rest.join(' '), tx + fw, 20);
  } else pdf.setTextColor(...INK).text(name, tx, 20);
  pdf.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK);
  if (co.tagline) pdf.text(pdf.splitTextToSize(co.tagline, room)[0] as string, tx, 27);
  pdf.setFont('helvetica', 'italic').setFontSize(9).setTextColor(40, 92, 150).text(BRAND.slogan, tx, 33);
  pdf.setDrawColor(...NAVY).setLineWidth(0.8).line(0, 46.5, W, 46.5);

  // contact strip (different for each branch)
  const c = contactOf(co, branch);
  const y = 48.5;
  pdf.setFillColor(...SOFT).roundedRect(M, y, W - 2 * M, 11.5, 2, 2, 'F');
  const item = (label: string, value: string, x: number, yy: number, maxW: number) => {
    pdf.setFillColor(...NAVY).circle(x + 1.3, yy - 1.1, 1.3, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...NAVY).text(label, x + 3.6, yy);
    const lw = pdf.getTextWidth(label + ' ');
    pdf.setFont('helvetica', 'normal').setTextColor(...INK);
    pdf.text((pdf.splitTextToSize(value, maxW - lw - 4) as string[])[0] ?? '', x + 3.6 + lw, yy);
  };
  const two = !!c.phone2;
  item('Mob:', [fmtPhone(c.phone), c.phone2 ? fmtPhone(c.phone2) : ''].filter(Boolean).join(', '), M + 3, y + 4.8, two ? 76 : 52);
  item('Email:', c.email, M + (two ? 80 : 57), y + 4.8, two ? 56 : 68);
  item(co.gstin ? 'GSTIN:' : 'Branch:', co.gstin || c.branch || '-', M + (two ? 137 : 127), y + 4.8, two ? 48 : 58);
  item('Address:', [c.address, co.gstin && c.branch ? `(${c.branch} branch)` : ''].filter(Boolean).join(' '), M + 3, y + 9.4, W - 2 * M - 6);
  return y + 13.5;
}

/** Rounded dark-blue tab that sits on top of a box, like a folder label. */
function tab(pdf: Pdf, title: string, x: number, y: number) {
  pdf.setFont('helvetica', 'bold').setFontSize(10);
  const w = pdf.getTextWidth(title) + 15;
  pdf.setFillColor(...NAVY).roundedRect(x, y, w, 8, 2, 2, 'F');
  pdf.rect(x, y + 5, w, 3, 'F'); // square bottom corners
  pdf.setFillColor(255, 255, 255).circle(x + 4.6, y + 4, 1.4, 'F');
  pdf.setTextColor(255, 255, 255).text(title, x + 8.4, y + 5.5);
  return w;
}

function box(pdf: Pdf, x: number, y: number, w: number, h: number, fill: RGB = PALE) {
  pdf.setFillColor(...fill).setDrawColor(...LINE).setLineWidth(0.35).roundedRect(x, y, w, h, 2, 2, 'FD');
}

interface Pair { label: string; value: string; full?: boolean }

const fmtOf = (dataUrl: string) => (/^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG');

/**
 * Keeps PDFs small (well under 1 MB): uploaded photos of a logo, stamp or signature can be several MB,
 * so they are redrawn at the size they are printed. The logo becomes a JPEG on white; stamp and
 * signature stay PNG so their transparent background is kept. Runs in the browser only.
 */
async function shrink(src: string | undefined, maxPx: number, jpeg: boolean): Promise<string | undefined> {
  if (!src || typeof document === 'undefined') return src;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (!g) return src;
    if (jpeg) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); }
    g.drawImage(img, 0, 0, w, h);
    const out = jpeg ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png');
    return out.length < src.length ? out : src;
  } catch { return src; }
}

/* ============================================== the PDF ============================================== */
export async function buildPdf(rec: DocRecord, cfg: ModuleConfig, ctx: PdfCtx) {
  const { company: co, branch, docs, opts } = ctx;
  const [logo, stamp, signature, clients] = await Promise.all([
    shrink(ctx.images.logo, 600, true), shrink(ctx.images.stamp, 360, false), shrink(ctx.images.signature, 360, false),
    rec.type === 'quotation' ? loadClientLogos() : Promise.resolve([]),
  ]);
  const images: PdfImages = { ...ctx.images, logo, stamp, signature };
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const calc = docCalc(rec, cfg, docs, co.state);
  const lastY = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let y = letterhead(pdf, co, images, branch);
  const ensure = (h: number) => { if (y + h > LIMIT) { pdf.addPage(); y = TOP2; } };
  const tableBase = { margin: { left: M, right: M, top: TOP2, bottom: 297 - LIMIT }, theme: 'grid' as const };

  /** Key : value pairs in two columns inside a box with a tab title. */
  const kvSection = (title: string, pairs: Pair[]) => {
    if (!pairs.length) return;
    const IW = W - 2 * M - 8;
    const colW = (IW - 6) / 2;
    const LW = 31;
    pdf.setFontSize(8.8);
    const rows: { l: Pair; r?: Pair; h: number; ll: string[]; lv: string[]; rl?: string[]; rv?: string[] }[] = [];
    for (let i = 0; i < pairs.length;) {
      const a = pairs[i];
      const b = pairs[i + 1];
      pdf.setFont('helvetica', 'bold');
      if (!a.full && b && !b.full) {
        const ll = pdf.splitTextToSize(a.label, LW - 1) as string[];
        const rl = pdf.splitTextToSize(b.label, LW - 1) as string[];
        pdf.setFont('helvetica', 'normal');
        const lv = pdf.splitTextToSize(a.value, colW - LW - 4) as string[];
        const rv = pdf.splitTextToSize(b.value, colW - LW - 4) as string[];
        rows.push({ l: a, r: b, ll, lv, rl, rv, h: Math.max(ll.length, lv.length, rl.length, rv.length) * 4 + 2.6 });
        i += 2;
      } else {
        const ll = pdf.splitTextToSize(a.label, LW - 1) as string[];
        pdf.setFont('helvetica', 'normal');
        const lv = pdf.splitTextToSize(a.value, IW - LW - 4) as string[];
        rows.push({ l: a, ll, lv, h: Math.max(ll.length, lv.length) * 4 + 2.6 });
        i += 1;
      }
    }
    let idx = 0;
    let first = true;
    while (idx < rows.length) {
      ensure(Math.min(6.5 + rows[idx].h + 4, 60));
      // as many rows as fit on this page
      let h = 2.5;
      let end = idx;
      while (end < rows.length && y + 6.5 + h + rows[end].h + 2 <= LIMIT) { h += rows[end].h; end++; }
      if (end === idx) { h += rows[idx].h; end = idx + 1; }
      h += 1.5;
      const y0 = y + 6.5;
      box(pdf, M, y0, W - 2 * M, h);
      tab(pdf, first ? title : `${title} (contd.)`, M, y);
      const anyPair = rows.slice(idx, end).some((r) => r.r);
      if (anyPair) pdf.setDrawColor(...LINE).setLineWidth(0.3).line(M + 4 + colW + 3, y0 + 2, M + 4 + colW + 3, y0 + h - 2);
      let ry = y0 + 2.5;
      for (let k = idx; k < end; k++) {
        const r = rows[k];
        const draw = (ll: string[], lv: string[], x: number) => {
          pdf.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(...INK);
          ll.forEach((t, j) => pdf.text(t, x, ry + 3.6 + j * 4));
          pdf.text(':', x + LW, ry + 3.6);
          pdf.setFont('helvetica', 'normal').setTextColor(35, 35, 35);
          lv.forEach((t, j) => pdf.text(t, x + LW + 3, ry + 3.6 + j * 4));
        };
        draw(r.ll, r.lv, M + 4);
        if (r.r) draw(r.rl!, r.rv!, M + 4 + colW + 6);
        ry += r.h;
      }
      y = y0 + h + 3;
      idx = end;
      first = false;
    }
  };

  /** Text lines inside a box with a tab title; carries on to the next page when long. */
  const textSection = (title: string, lines: string[], size = 8.4, lineH = 3.9, x = M, w = W - 2 * M) => {
    let i = 0;
    let first = true;
    if (lines.length <= 14) ensure(6.5 + lines.length * lineH + 5); // short: keep the box in one piece
    while (i < lines.length) {
      ensure(6.5 + lineH * Math.min(3, lines.length - i) + 6);
      const fit = Math.max(1, Math.floor((LIMIT - y - 6.5 - 5) / lineH));
      const part = lines.slice(i, i + fit);
      const h = part.length * lineH + 5;
      box(pdf, x, y + 6.5, w, h);
      tab(pdf, first ? title : `${title} (contd.)`, x, y);
      pdf.setFont('helvetica', 'normal').setFontSize(size).setTextColor(35, 35, 35);
      part.forEach((t, j) => pdf.text(t, x + 4, y + 6.5 + 4.6 + j * lineH));
      y += 6.5 + h + 4;
      i += part.length;
      first = false;
    }
  };

  /* ----- letter layout (NOC, letterhead…) ----- */
  if (cfg.letter) {
    y += 2;
    pdf.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(10);
    pdf.text(`Ref: ${rec.number}`, M, y + 3);
    pdf.text(`Date: ${fmtDate(rec.docDate)}`, W - M, y + 3, { align: 'right' });
    y += 12;
    const d = rec.data;
    const block = (text: string, bold = false, size = 10.5) => {
      pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(30);
      (pdf.splitTextToSize(clean(text), W - 2 * M) as string[]).forEach((s) => { ensure(6); pdf.text(s, M, y); y += 5.2; });
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
    pageFrames(pdf, rec, co, cfg.title);
    return pdf;
  }

  /* ----- title pill + number / date ----- */
  const gstBill = rec.type === 'bill' && !!co.gstin && (calc.money?.gst ?? 0) > 0;
  const title = gstBill ? 'TAX INVOICE' : cfg.title.toUpperCase();
  pdf.setFont('helvetica', 'bold').setFontSize(17);
  const tw = pdf.getTextWidth(title);
  const pw = tw + 22;
  const px = (W - pw) / 2;
  pdf.setDrawColor(...LINE).setLineWidth(0.5);
  pdf.line(M, y + 5.5, px - 4, y + 5.5);
  pdf.line(px + pw + 4, y + 5.5, W - M, y + 5.5);
  pdf.setFillColor(...NAVY).roundedRect(px, y, pw, 11, 5.5, 5.5, 'F');
  pdf.setFillColor(255, 255, 255).rect(px + 6, y + 2.6, 4.6, 5.8, 'F'); // little document icon
  pdf.setDrawColor(...NAVY).setLineWidth(0.35);
  [4.4, 5.8, 7.2].forEach((dy) => pdf.line(px + 6.9, y + dy, px + 9.7, y + dy));
  pdf.setTextColor(255, 255, 255).text(title, px + 14, y + 7.8);
  y += 15.5;
  pdf.setFontSize(10).setTextColor(...BLUE).text('No:', M, y);
  pdf.setTextColor(...INK).text(rec.number, M + pdf.getTextWidth('No: '), y);
  const dateText = `Date: ${fmtDate(rec.docDate)}`;
  const dw = pdf.getTextWidth(dateText);
  pdf.text(dateText, W - M, y, { align: 'right' });
  pdf.setDrawColor(...NAVY).setLineWidth(0.4).rect(W - M - dw - 6, y - 3.3, 3.8, 3.6); // calendar icon
  pdf.setFillColor(...NAVY).rect(W - M - dw - 6, y - 3.3, 3.8, 1, 'F');
  y += 5;

  /* ----- sections ----- */
  for (const sec of cfg.sections) {
    if (sec.print === false) continue; // payment / insurance boxes are shown in the totals instead
    const fields = sec.fields.filter((f) => f.type !== 'bill' && rec.data[f.key] && isVisible(f, rec.data));
    kvSection(clean(sec.title), fields.map((f) => ({ label: clean(f.label), value: fieldValue(f, rec.data[f.key]), full: f.type === 'textarea' })));
  }

  const tableHead = { fillColor: NAVY, textColor: [255, 255, 255] as RGB, fontStyle: 'bold' as const, fontSize: 8.6, halign: 'center' as const };
  const tableBody = { fontSize: 8.5, cellPadding: 1.8, lineColor: LINE, lineWidth: 0.25, textColor: INK };

  /* ----- household items list (quotation / bill) ----- */
  const goods = cfg.goods ? readGoods(rec.data) : [];
  if (goods.length) {
    const withRemarks = goods.some((r) => (r.remarks || '').trim());
    const withValue = goods.some((r) => num(r.value) > 0);
    const head = ['#', 'Item / particulars', 'Qty', ...(withValue ? ['Value'] : []), ...(withRemarks ? ['Remarks'] : [])];
    const body = goods.map((r, i) => [String(i + 1), clean(r.description), r.qty || '', ...(withValue ? [num(r.value) ? inrPdf(num(r.value)) : ''] : []), ...(withRemarks ? [clean(r.remarks || '')] : [])]);
    if (withValue) body.push(['', 'Total value', '', inrPdf(goods.reduce((a, r) => a + num(r.value), 0)), ...(withRemarks ? [''] : [])]);
    ensure(30);
    tab(pdf, `Items list (${goods.length})`, M, y);
    autoTable(pdf, {
      ...tableBase, startY: y + 7, head: [head], body,
      columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center', cellWidth: 16 }, ...(withValue ? { 3: { halign: 'right', cellWidth: 30 } } : {}) },
      headStyles: tableHead, styles: tableBody, alternateRowStyles: { fillColor: PALE },
    });
    y = lastY() + 5;
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
        body = rows.map((r, i) => [String(i + 1), clean(r.description), ...(showHsn ? [r.hsn || ''] : []), `${r.qty || ''} ${r.unit || ''}`.trim(), inrPdf(num(r.rate)), ...(showGst ? [String(effRate(r))] : []), inrPdf(lineAmount(r))]);
        const n = head.length;
        right = (showGst ? [n - 4, n - 3, n - 2, n - 1] : [n - 3, n - 2, n - 1]).filter((i) => head[i] !== 'HSN/SAC' && head[i] !== 'Description');
      } else {
        head = ['#', ...cols.map((c) => clean(c.label))];
        body = rows.map((r, i) => [String(i + 1), ...cols.map((c) => clean(r[c.key] || ''))]);
        right = cols.map((c, i) => (c.type === 'number' ? i + 1 : -1)).filter((i) => i >= 0);
      }
      const columnStyles: Record<number, { halign: 'right' | 'center' }> = { 0: { halign: 'center' } };
      right.forEach((i) => (columnStyles[i] = { halign: 'right' }));
      ensure(30);
      tab(pdf, clean(cfg.itemsTitle || 'Items'), M, y);
      autoTable(pdf, { ...tableBase, startY: y + 7, body, columnStyles, head: [head], headStyles: tableHead, styles: tableBody, alternateRowStyles: { fillColor: PALE } });
      y = lastY() + 3;
      const sm = summary({ items: rows }, cfg);
      if (sm.length) {
        ensure(8);
        pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...INK);
        pdf.text(clean(sm.map(([t, v]) => `${t}: ${v}`).join('     ')), M, y + 3);
        y += 7;
      } else y += 2;
    }
  }

  /* ----- GST summary ----- */
  const m = calc.money;
  const hideTotal = !!m?.hideTotal; // quotation: "Total amount in PDF: Hide"
  if (m && m.gst > 0 && !hideTotal && m.gstMode !== 'rateOnly') { // "GST % Show & GST Charge Hide" prints no GST amounts
    ensure(12 + m.tax.length * 7);
    const head = m.igst ? ['Tax rate', 'Taxable value', 'IGST', 'Total tax'] : ['Tax rate', 'Taxable value', 'CGST', 'SGST', 'Total tax'];
    const body = m.tax.filter((t) => t.rate > 0).map((t) => (m.igst
      ? [`${t.rate}%`, inrPdf(t.taxable), inrPdf(t.gst), inrPdf(t.gst)]
      : [`${t.rate}%`, inrPdf(t.taxable), inrPdf(t.cgst), inrPdf(t.sgst), inrPdf(t.gst)]));
    autoTable(pdf, {
      ...tableBase, startY: y, head: [head], body,
      headStyles: { ...tableHead, fontSize: 9 }, styles: { ...tableBody, fontSize: 9, halign: 'center', cellPadding: 2.2 },
    });
    y = lastY() + 5;
  }

  /* ----- amount in words, bank + QR, note (left) and the amounts (right) ----- */
  const totalLabel = cfg.slug === 'receipt' ? 'Amount received' : 'Total';
  const amountLines: CalcLine[] = hideTotal ? [] : calc.lines.length ? calc.lines : calc.total > 0 ? [{ label: totalLabel, value: calc.total, bold: true }] : [];
  const qrAmount = upiAmount(rec, cfg, m, calc.status); // amount due after discount, advance and payments
  const qrUri = hideTotal ? null : upiUri(co, qrAmount, rec.number);
  const showQr = opts.qr && !!qrUri;
  const bankLines = cfg.bank
    ? [co.bankName && `Bank: ${co.bankName}`, co.accountName && `A/c name: ${co.accountName}`, co.accountNo && `A/c no: ${co.accountNo}`, co.ifsc && `IFSC: ${co.ifsc}`, co.upi && `UPI: ${co.upi}`].filter(Boolean) as string[]
    : [];
  const notes = clean(rec.data.notes || '').trim();
  const LW = amountLines.length ? 100 : W - 2 * M;
  const RX = M + LW + 6;
  const RW = W - M - RX;

  pdf.setFont('helvetica', 'bold').setFontSize(11.5);
  const words = calc.total > 0 && !hideTotal ? (pdf.splitTextToSize(amountInWords(calc.total), LW - 8) as string[]) : [];
  pdf.setFont('helvetica', 'normal').setFontSize(8.4);
  const bankW = showQr ? LW - 40 : LW - 8;
  const bankPairs = !showQr && bankLines.every((t) => pdf.getTextWidth(t) < (LW - 12) / 2);
  const bank = bankPairs
    ? bankLines.reduce<string[][]>((a, t, i) => (i % 2 ? (a[a.length - 1].push(t), a) : [...a, [t]]), []).map((p) => p.join('\u0000'))
    : bankLines.flatMap((t) => (pdf.splitTextToSize(t, bankW) as string[]).slice(0, 1));
  const noteLines = notes ? (pdf.splitTextToSize(notes, LW - 8) as string[]) : [];
  const noteLeft = noteLines.length > 0 && noteLines.length <= 10;
  const wordsH = words.length ? 6.5 + words.length * 5.2 + 5 + 4 : 0;
  const bankH = bank.length || showQr ? 6.5 + Math.max(bank.length * 4.4 + 5, showQr ? 33 : 0) + 4 : 0;
  const noteH = noteLeft ? 6.5 + noteLines.length * 3.9 + 5 + 4 : 0;

  // right column rows
  pdf.setFontSize(8.8);
  const finalIdx = (() => {
    let k = -1;
    amountLines.forEach((ln, i) => { if (ln.bold && /total|amount received/i.test(ln.label) && !/sub/i.test(ln.label)) k = i; });
    return k;
  })();
  const rrows = amountLines.map((ln, i) => {
    pdf.setFont('helvetica', ln.bold ? 'bold' : 'normal');
    const lab = pdf.splitTextToSize(clean(ln.label), RW - 36) as string[];
    const val = pdf.splitTextToSize(clean(ln.text ?? sign(ln.value)), 31) as string[];
    return { ln, lab, val, h: i === finalIdx ? 10 : Math.max(lab.length, val.length) * 3.9 + 3.2 };
  });
  const rightH = rrows.reduce((a, r) => a + r.h, 0) + 2;

  if (wordsH || bankH || noteH || rightH > 2) {
    ensure(Math.min(Math.max(wordsH + bankH + noteH, rightH), LIMIT - TOP2));
    const top = y;
    // left column
    let ly = top;
    if (words.length) {
      box(pdf, M, ly + 6.5, LW, words.length * 5.2 + 5, [255, 255, 255]);
      tab(pdf, 'Amount in words', M, ly);
      pdf.setFont('helvetica', 'bold').setFontSize(11.5).setTextColor(...INK);
      words.forEach((t, i) => pdf.text(t, M + 4, ly + 6.5 + 5.6 + i * 5.2));
      ly += wordsH;
    }
    if (bankH) {
      const bh = Math.max(bank.length * 4.4 + 5, showQr ? 33 : 0);
      box(pdf, M, ly + 6.5, LW, bh);
      tab(pdf, showQr && !bank.length ? 'Scan to pay' : 'Bank details', M, ly);
      pdf.setFont('helvetica', 'normal').setFontSize(8.4).setTextColor(35, 35, 35);
      bank.forEach((t, i) => {
        const [a, b] = t.split('\u0000');
        pdf.text(a, M + 4, ly + 6.5 + 4.8 + i * 4.4);
        if (b) pdf.text(b, M + 4 + (LW - 8) / 2 + 2, ly + 6.5 + 4.8 + i * 4.4);
      });
      if (showQr) {
        try {
          const QR = (await import('qrcode')).default;
          const img = await QR.toDataURL(qrUri!, { margin: 1, width: 280, errorCorrectionLevel: 'M' });
          const qx = M + LW - 31;
          pdf.addImage(img, 'PNG', qx, ly + 7.8, 26, 26, 'qr', 'FAST');
          pdf.setFont('helvetica', 'bold').setFontSize(6.8).setTextColor(...NAVY);
          pdf.text(`Scan to pay ${inrPdf(qrAmount)}`, qx + 13, ly + 6.5 + bh - 1.2, { align: 'center' });
        } catch { /* skip QR if it cannot be drawn */ }
      }
      ly += bankH;
    }
    if (noteLeft) {
      box(pdf, M, ly + 6.5, LW, noteLines.length * 3.9 + 5, SOFT);
      tab(pdf, 'Note', M, ly);
      pdf.setFont('helvetica', 'normal').setFontSize(8.4).setTextColor(35, 35, 35);
      noteLines.forEach((t, i) => pdf.text(t, M + 4, ly + 6.5 + 4.6 + i * 3.9));
      ly += noteH;
    }
    // right column: the amounts, with the final total as a dark bar
    let ry = top;
    if (rrows.length) {
      const plainEnd = finalIdx >= 0 ? finalIdx : rrows.length;
      const plainH = rrows.slice(0, plainEnd).reduce((a, r) => a + r.h, 0);
      if (plainH) {
        pdf.setFillColor(255, 255, 255).setDrawColor(...LINE).setLineWidth(0.35).roundedRect(RX, ry, RW, plainH, 1.8, 1.8, 'FD');
      }
      rrows.forEach((r, i) => {
        if (i === finalIdx) {
          pdf.setFillColor(...NAVY).roundedRect(RX, ry, RW, r.h, 1.8, 1.8, 'F');
          pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255, 255, 255);
          pdf.text(r.lab[0], RX + 4, ry + 6.8);
          pdf.text(r.val[0], RX + RW - 4, ry + 6.8, { align: 'right' });
          ry += r.h;
          return;
        }
        if (r.ln.bold) pdf.setFillColor(...SOFT).rect(RX + 0.2, ry + 0.2, RW - 0.4, r.h - 0.4, 'F');
        if (i > 0 && i !== finalIdx + 1) pdf.setDrawColor(...LINE).setLineWidth(0.25).line(RX, ry, RX + RW, ry);
        pdf.setDrawColor(...LINE).setLineWidth(0.25).line(RX + RW - 35, ry, RX + RW - 35, ry + r.h);
        pdf.setFont('helvetica', r.ln.bold ? 'bold' : 'normal').setFontSize(8.8).setTextColor(...INK);
        r.lab.forEach((t, j) => pdf.text(t, RX + 3, ry + 4.4 + j * 3.9));
        r.val.forEach((t, j) => pdf.text(t, RX + RW - 3, ry + 4.4 + j * 3.9, { align: 'right' }));
        ry += r.h;
      });
      if (finalIdx >= 0 && finalIdx < rrows.length - 1) {
        // lines after the total (advance, balance…) get their own outline
        const afterTop = top + rrows.slice(0, finalIdx + 1).reduce((a, r) => a + r.h, 0);
        pdf.setDrawColor(...LINE).setLineWidth(0.35).roundedRect(RX, afterTop + 0.6, RW, ry - afterTop - 0.6, 1.8, 1.8, 'S');
      }
      ry += 4;
    }
    y = Math.max(ly, ry);
  }

  /* ----- rate per KG, reverse charge, who pays GST ----- */
  if (m?.notes?.length && !hideTotal) {
    ensure(6);
    pdf.setFont('helvetica', 'italic').setFontSize(8.4).setTextColor(60);
    (pdf.splitTextToSize(clean(m.notes.join('    |    ')), W - 2 * M) as string[]).forEach((t) => { pdf.text(t, M, y); y += 4; });
    y += 2;
  }

  /* ----- long note + terms ----- */
  if (noteLines.length && !noteLeft) {
    pdf.setFontSize(8.4);
    textSection('Note', pdf.splitTextToSize(notes, W - 2 * M - 8) as string[]);
  }
  /* ----- quotation: our previous clients (logos from lib/brand.ts → CLIENT_LOGOS) ----- */
  if (clients.length) {
    const IW = W - 2 * M;
    const cols = 5;
    const cellW = (IW - 8) / cols;
    const cellH = 16;
    const rows = Math.ceil(clients.length / cols);
    const h = rows * cellH + 3;
    ensure(6.5 + h + 4);
    const y0 = y + 6.5;
    box(pdf, M, y0, IW, h, [255, 255, 255]);
    tab(pdf, 'Our valued clients', M, y);
    clients.forEach((c, i) => {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, clients.length - r * cols);
      const x0 = M + 4 + ((cols - inRow) * cellW) / 2 + (i % cols) * cellW; // a short last row is centred
      // same visual weight for wide and square logos: equal area, within the cell
      const maxW = cellW - 7;
      const maxH = cellH - 4;
      let hh = Math.min(maxH, Math.sqrt(190 / c.ratio));
      let w = hh * c.ratio;
      if (w > maxW) { w = maxW; hh = w / c.ratio; }
      try { pdf.addImage(c.src, 'JPEG', x0 + (cellW - w) / 2, y0 + 1.5 + r * cellH + (cellH - hh) / 2, w, hh, `client${i}`, 'FAST'); } catch { /* skip a bad picture */ }
    });
    y = y0 + h + 4;
  }

  if (ctx.terms.length) {
    pdf.setFont('helvetica', 'normal').setFontSize(8.2);
    const lines = ctx.terms.flatMap((t, i) => {
      const parts = pdf.splitTextToSize(clean(t), W - 2 * M - 14) as string[];
      return parts.map((p, j) => (j === 0 ? `${i + 1}.   ${p}` : `      ${p}`));
    });
    textSection('Terms & Conditions', lines, 8.2, 3.8);
  }

  /* ----- signatures (a little tighter when that keeps them on the same page) ----- */
  if (y + 28 > LIMIT + 5) { pdf.addPage(); y = TOP2; }
  const sy = y + 1;
  pdf.setDrawColor(...NAVY).setLineWidth(1.1).line(M + 2, sy + 25, M + 6, sy + 17); // pen
  pdf.setFillColor(...NAVY).circle(M + 1.8, sy + 25.4, 0.7, 'F');
  pdf.setDrawColor(...NAVY).setLineWidth(0.4).line(M + 9, sy + 21, M + 56, sy + 21);
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK).text(clean(cfg.signLabels[0]), M + 9, sy + 26);
  // boxes in the middle
  const cx = W / 2;
  pdf.setDrawColor(...LINE).setLineWidth(0.5).line(cx - 30, sy + 21, cx - 14, sy + 21).line(cx + 14, sy + 21, cx + 30, sy + 21);
  const carton = (x: number, yy: number, w: number, h: number) => {
    pdf.setFillColor(206, 150, 96).rect(x, yy, w, h, 'F');
    pdf.setFillColor(232, 196, 148).rect(x + w / 2 - 0.9, yy, 1.8, h, 'F');
    pdf.setFillColor(180, 126, 76).rect(x, yy, w, 1, 'F');
  };
  carton(cx - 10, sy + 16, 9.5, 8);
  carton(cx + 0.5, sy + 16, 9.5, 8);
  carton(cx - 4.8, sy + 9.2, 9.6, 6.8);
  // company side
  pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...NAVY);
  if (co.name) pdf.text(`For ${co.name}`, W - M - 2, sy + 2, { align: 'right' });
  drawSignature(pdf, co, images, opts.stamp, W - M - 60, sy + 4);
  pdf.setDrawColor(...INK).setLineWidth(0.4).line(W - M - 58, sy + 21, W - M - 2, sy + 21);
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK).text(clean(cfg.signLabels[1]), W - M - 30, sy + 26, { align: 'center' });
  y = sy + 29;

  /* ----- watermark ----- */
  const wm = opts.watermark && rec.type === 'bill' ? ({ Paid: ['PAID', [22, 163, 74]], Unpaid: ['UNPAID', [220, 38, 38]], Partial: ['PART PAID', [217, 119, 6]], Cancelled: ['CANCELLED', [100, 100, 100]] } as Record<string, [string, RGB]>)[calc.status] : undefined;
  if (wm) {
    const n = pdf.getNumberOfPages();
    const P = pdf as unknown as { GState: new (o: { opacity: number }) => object; setGState: (g: object) => void };
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      P.setGState(new P.GState({ opacity: 0.08 }));
      pdf.setFont('helvetica', 'bold').setFontSize(wm[0].length > 6 ? 62 : 92).setTextColor(...wm[1]);
      const a = (35 * Math.PI) / 180;
      const w = pdf.getTextWidth(wm[0]);
      pdf.text(wm[0], 105 - (w / 2) * Math.cos(a), 160 + (w / 2) * Math.sin(a), { angle: 35 });
      P.setGState(new P.GState({ opacity: 1 }));
    }
  }
  pageFrames(pdf, rec, co, title);
  return pdf;
}

function drawSignature(pdf: Pdf, co: Company, images: PdfImages, on: boolean, x: number, y: number) {
  if (!on) return;
  try {
    if (images.stamp) { const h = 17; const w = Math.min(h * (co.stampRatio || 1), 28); pdf.addImage(images.stamp, fmtOf(images.stamp), x, y, w, h, 'stamp', 'FAST'); }
    if (images.signature) { const h = 11; const w = Math.min(h * (co.signRatio || 2), 34); pdf.addImage(images.signature, fmtOf(images.signature), x + 24, y + 4, w, h, 'sign', 'FAST'); }
  } catch { /* ignore bad images */ }
}

/** Footer wave with the number and page on every page, and a small header on pages 2 onwards. */
function pageFrames(pdf: Pdf, rec: DocRecord, co: Company, title: string) {
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFillColor(214, 231, 250);
    pdf.lines([[60, -6, 140, 8, W, -2], [0, 18], [-W, 0]], 0, 281, [1, 1], 'F', true);
    pdf.setFillColor(...NAVY);
    pdf.lines([[70, -5, 130, 6, W, -1], [0, 12.5], [-W, 0]], 0, 285.5, [1, 1], 'F', true);
    pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(255, 255, 255);
    pdf.text(`${rec.number}   |   Page ${i} of ${n}`, W / 2, 292.8, { align: 'center' });
    if (i > 1) {
      pdf.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...NAVY).text(co.name || '', M, 10);
      pdf.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...INK).text(`${title}  ${rec.number}`, W - M, 10, { align: 'right' });
      pdf.setDrawColor(...LINE).setLineWidth(0.5).line(M, 12.5, W - M, 12.5);
    }
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
