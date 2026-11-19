import type { Company, CompanyProfile, SettingsBundle } from './types';
import { DEFAULT_COMPANY, PROFILE_KEYS } from './defaults';

const has = (v: unknown) => v !== undefined && v !== null && v !== '' && v !== 0;

/** Company default + whatever the branch overrides. */
export function effectiveCompany(b: SettingsBundle | null | undefined, branchId?: string | null): Company {
  const base: Company = { ...DEFAULT_COMPANY, ...(b?.global ?? {}) };
  const ov = (branchId && b?.branch?.[branchId]) || {};
  const out = { ...base } as Record<string, unknown>;
  for (const k of PROFILE_KEYS) {
    const v = (ov as Record<string, unknown>)[k];
    if (has(v)) out[k] = v;
  }
  // an overridden image keeps its own ratio; a ratio alone is never an override
  for (const [id, ratio] of [['logoId', 'logoRatio'], ['stampId', 'stampRatio'], ['signatureId', 'signRatio']] as const) {
    if (!has((ov as Record<string, unknown>)[id])) out[ratio] = (base as unknown as Record<string, unknown>)[ratio];
  }
  return out as unknown as Company;
}

export function effectiveTerms(b: SettingsBundle | null | undefined, slug: string, branchId: string | null | undefined, fallback: string[]): string[] {
  return (branchId && b?.terms?.branch?.[branchId]?.[slug]) || b?.terms?.global?.[slug] || fallback;
}

export type { CompanyProfile };
