'use client';
import { useCallback } from 'react';
import type { DocRecord } from './types';
import { BY_SLUG } from './config';
import { loadCompanyImages } from './images';
import { downloadPdf } from './pdf';
import { useAllDocs, useBranches, useCompanyFor, useTermsFor } from './store';

/** Download a document's PDF straight from a list, with the same settings as the document page uses by default. */
export function usePdfDownload() {
  const all = useAllDocs();
  const branches = useBranches();
  const companyFor = useCompanyFor();
  const termsFor = useTermsFor();
  return useCallback(async (rec: DocRecord) => {
    const cfg = BY_SLUG[rec.type];
    if (!cfg) return;
    const co = companyFor(rec.branchId);
    const terms = (rec.data.terms !== undefined ? rec.data.terms : termsFor(cfg.slug, rec.branchId, cfg.terms).join('\n')).split('\n').map((t) => t.trim()).filter(Boolean);
    await downloadPdf(rec, cfg, {
      company: co, images: await loadCompanyImages(co), branch: branches.find((b) => b.id === rec.branchId), docs: all, terms,
      opts: { stamp: co.pdfStamp, qr: co.pdfQr, watermark: co.pdfWatermark },
    });
  }, [all, branches, companyFor, termsFor]);
}
