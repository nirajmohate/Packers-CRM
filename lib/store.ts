'use client';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Branch, Company, DocRecord, SessionUser, SettingsBundle } from './types';
import { api, ApiFail } from './api';
import { DEFAULT_COMPANY } from './defaults';
import { effectiveCompany, effectiveTerms } from './settingsFn';

export { ApiFail };
type Phase = 'boot' | 'ready' | 'anon' | 'mustchange' | 'error';
interface State {
  phase: Phase;
  error: string;
  user: SessionUser | null;
  docs: DocRecord[];
  since: string;
  trash: DocRecord[] | null;
  branches: Branch[];
  settings: SettingsBundle | null;
  branchFilter: string; // admin's header choice: "all" or a branch id
}

const EMPTY: State = { phase: 'boot', error: '', user: null, docs: [], since: '', trash: null, branches: [], settings: null, branchFilter: 'all' };
let state: State = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
function set(patch: Partial<State>) { state = { ...state, ...patch }; listeners.forEach((l) => l()); }
const useSel = <T,>(sel: (s: State) => T): T => useSyncExternalStore(subscribe, () => sel(state), () => sel(EMPTY));

/* ---------- loading ---------- */
let inflight: Promise<void> | null = null;
let writing = 0;
const FILTER_KEY = 'pm_branch_filter';

interface Bootstrap { user: SessionUser; branches?: Branch[]; settings?: SettingsBundle; docs?: DocRecord[]; since?: string }

export async function boot() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await api<Bootstrap>('/api/bootstrap' + (state.since ? `?since=${state.since}` : ''));
      if (r.user.mustChangePassword) { set({ user: r.user, phase: 'mustchange' }); return; }
      let filter = state.branchFilter;
      if (state.phase === 'boot' && r.user.role === 'admin') { try { filter = localStorage.getItem(FILTER_KEY) || 'all'; } catch { /* ignore */ } }
      const branches = r.branches ?? [];
      if (filter !== 'all' && !branches.some((b) => b.id === filter)) filter = 'all';
      // keep the trash cache only if it was loaded before
      set({ phase: 'ready', error: '', user: r.user, docs: r.docs ?? [], since: r.since ?? state.since, branches, settings: r.settings ?? null, branchFilter: r.user.role === 'admin' ? filter : 'all' });
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) set({ phase: 'anon', user: null });
      else if (state.phase === 'boot') set({ phase: 'error', error: e instanceof Error ? e.message : 'Could not load' });
      // a failed background refresh keeps the screen as it is
    } finally { inflight = null; }
  })();
  return inflight;
}

/** Pulls the latest data (other people may have saved documents). Skipped while this device is saving. */
export async function refresh(force = false) {
  if (state.phase !== 'ready' || (writing > 0 && !force)) return;
  await boot();
}

export async function ensureSince(date: string) {
  if (!state.since || date >= state.since) return;
  const r = await api<{ docs: DocRecord[] }>(`/api/docs?since=${date}`);
  set({ docs: r.docs, since: date });
}

export async function loadTrash() {
  const r = await api<{ docs: DocRecord[] }>('/api/docs/trash');
  set({ trash: r.docs });
}

export async function refreshBranches() {
  const r = await api<{ branches: Branch[] }>('/api/branches');
  set({ branches: r.branches });
}

export async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* signing out anyway */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('pm_draft_') || k.startsWith('pm_rates_')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
  state = EMPTY;
  window.location.href = '/login';
}

/* ---------- reading ---------- */
export const usePhase = () => useSel((s) => s.phase);
export const useLoadError = () => useSel((s) => s.error);
export const useSession = () => useSel((s) => s.user);
export const useHydrated = () => useSel((s) => s.phase === 'ready');
export const useAllDocs = () => useSel((s) => s.docs);
export const useLiveDocs = useAllDocs;
export const useTrash = () => useSel((s) => s.trash);
export const useBranches = () => useSel((s) => s.branches);
export const useSettings = () => useSel((s) => s.settings);
const useFilter = () => useSel((s) => s.branchFilter);

export function useActiveBranches() {
  const b = useBranches();
  return useMemo(() => b.filter((x) => x.active !== false), [b]);
}

/** The branch the screen is working in: a manager's own branch, or the admin's header choice ("all" = every branch). */
export function useActiveBranch(): [string, (id: string) => void] {
  const user = useSession();
  const filter = useFilter();
  const setIt = useCallback((id: string) => { set({ branchFilter: id }); try { localStorage.setItem(FILTER_KEY, id); } catch { /* ignore */ } }, []);
  return [user?.role === 'manager' ? user.branchId ?? 'all' : filter, setIt];
}

export function useDocs() {
  const all = useAllDocs();
  const [branch] = useActiveBranch();
  return useMemo(() => (branch === 'all' ? all : all.filter((d) => d.branchId === branch)), [all, branch]);
}

/** Effective company details for a branch (defaults to the branch you are working in). */
export function useCompany(branchId?: string | null): Company {
  const settings = useSettings();
  const [active] = useActiveBranch();
  const id = branchId ?? (active !== 'all' ? active : null);
  return useMemo(() => (settings ? effectiveCompany(settings, id) : DEFAULT_COMPANY), [settings, id]);
}

/** Home state of a branch, for CGST/SGST vs IGST. */
export function useHomeState() {
  const settings = useSettings();
  return useCallback((branchId?: string | null) => effectiveCompany(settings, branchId).state, [settings]);
}
export function useCompanyFor() {
  const settings = useSettings();
  return useCallback((branchId?: string | null) => effectiveCompany(settings, branchId), [settings]);
}
export function useTermsFor() {
  const settings = useSettings();
  return useCallback((slug: string, branchId: string | null | undefined, fallback: string[]) => effectiveTerms(settings, slug, branchId, fallback), [settings]);
}

/* ---------- writing documents ---------- */
async function write<T>(fn: () => Promise<T>): Promise<T> {
  writing++;
  try { return await fn(); } finally { writing--; }
}
const upsert = (docs: DocRecord[], d: DocRecord) => (docs.some((x) => x.id === d.id) ? docs.map((x) => (x.id === d.id ? d : x)) : [d, ...docs]);

export interface DocInput { type: string; branchId?: string; number?: string; status?: string; docDate: string; data: Record<string, string>; items: Record<string, string>[]; rev?: number }

export const createDoc = (input: DocInput) => write(async () => {
  const r = await api<{ doc: DocRecord }>('/api/docs', { body: input });
  set({ docs: upsert(state.docs, r.doc) });
  return r.doc;
});
export const updateDoc = (id: string, input: DocInput) => write(async () => {
  const r = await api<{ doc: DocRecord }>(`/api/docs/${id}`, { method: 'PUT', body: input });
  set({ docs: upsert(state.docs, r.doc) });
  return r.doc;
});
export const setDocStatus = (id: string, status: string) => write(async () => {
  const r = await api<{ doc: DocRecord }>(`/api/docs/${id}`, { method: 'PATCH', body: { status } });
  set({ docs: upsert(state.docs, r.doc) });
  return r.doc;
});
export const softDelete = (id: string) => write(async () => {
  await api(`/api/docs/${id}`, { method: 'DELETE' });
  const d = state.docs.find((x) => x.id === id);
  set({ docs: state.docs.filter((x) => x.id !== id), trash: state.trash && d ? [{ ...d, deletedAt: new Date().toISOString() }, ...state.trash] : state.trash });
});
export const restoreDoc = (id: string) => write(async () => {
  const r = await api<{ doc: DocRecord }>(`/api/docs/${id}/restore`, { method: 'POST', body: {} });
  set({ docs: upsert(state.docs, r.doc), trash: state.trash ? state.trash.filter((x) => x.id !== id) : null });
});
export const purgeDoc = (id: string) => write(async () => {
  await api(`/api/docs/${id}?purge=1`, { method: 'DELETE' });
  set({ trash: state.trash ? state.trash.filter((x) => x.id !== id) : null });
});
export const emptyTrash = () => write(async () => {
  await api('/api/docs/trash', { method: 'DELETE' });
  set({ trash: [] });
});

/* ---------- settings ---------- */
export interface SettingsPayload { scope: string; profile?: Record<string, unknown>; rules?: Record<string, unknown>; terms?: Record<string, string[] | null> }
export async function saveSettings(p: SettingsPayload) {
  const r = await api<{ settings: SettingsBundle }>('/api/settings', { method: 'PUT', body: p });
  set({ settings: r.settings });
}
export async function uploadAsset(kind: 'logo' | 'stamp' | 'signature', scope: string, dataUrl: string, ratio: number) {
  return api<{ id: string; ratio: number }>('/api/assets', { body: { kind, scope, dataUrl, ratio } });
}

/* ---------- drafts (unsaved forms), kept per user on this device ---------- */
const dk = (k: string) => `pm_draft_${state.user?.id ?? 'x'}_${k}`;
export const readDraft = <T,>(key: string): T | null => { try { const r = localStorage.getItem(dk(key)); return r ? (JSON.parse(r) as T) : null; } catch { return null; } };
export const writeDraft = (key: string, v: unknown) => { try { localStorage.setItem(dk(key), JSON.stringify(v)); } catch { /* ignore */ } };
export const clearDraft = (key: string) => { try { localStorage.removeItem(dk(key)); } catch { /* ignore */ } };

/* ---------- remembered rates / SAC codes for item descriptions (this device only) ---------- */
export interface RateMemo { rate?: string; hsn?: string; unit?: string; gst?: string }
const rk = () => `pm_rates_${state.user?.id ?? 'x'}`;
export const getRates = (): Record<string, RateMemo> => { try { return JSON.parse(localStorage.getItem(rk()) || '{}'); } catch { return {}; } };
export function rememberRates(items: { description?: string; rate?: string; hsn?: string; unit?: string; gst?: string }[]) {
  const m = getRates();
  for (const r of items) {
    const key = (r.description || '').trim().toLowerCase();
    if (!key || !r.rate) continue;
    m[key] = { rate: r.rate, hsn: r.hsn || m[key]?.hsn, unit: r.unit || m[key]?.unit, gst: r.gst ?? m[key]?.gst };
  }
  try { localStorage.setItem(rk(), JSON.stringify(m)); } catch { /* ignore */ }
}

/** Pulls the first-run Stage 1 data out of this browser (for the one-time import). */
export function readLegacyBrowserData() {
  const get = (k: string) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  return { docs: (get('pm_docs_v1') as DocRecord[] | null) ?? [], company: get('pm_company_v1'), branches: (get('pm_branches_v1') as Branch[] | null) ?? [], terms: (get('pm_terms_v1') as Record<string, string[]> | null) ?? {} };
}
export const clearLegacyBrowserData = () => ['pm_docs_v1', 'pm_company_v1', 'pm_branches_v1', 'pm_branch_v1', 'pm_terms_v1'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
