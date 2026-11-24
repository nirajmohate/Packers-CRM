'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { Lead, LeadInput } from './leads';

/** Leads are loaded only when a page needs them (customers page, new-document form), and only for users who may see them. */
let state: { leads: Lead[]; loaded: boolean; loading: boolean; error: string } = { leads: [], loaded: false, loading: false, error: '' };
const subs = new Set<() => void>();
const set = (p: Partial<typeof state>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

export async function loadLeads(force = false) {
  if (state.loading || (state.loaded && !force)) return;
  set({ loading: true, error: '' });
  try {
    const r = await api<{ leads: Lead[] }>('/api/leads');
    set({ leads: r.leads, loaded: true, loading: false });
  } catch (e) {
    set({ loading: false, loaded: true, error: (e as Error).message });
  }
}

export function useLeads(enabled = true) {
  useEffect(() => { if (enabled) void loadLeads(); }, [enabled]);
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export async function saveLead(id: string | null, body: LeadInput): Promise<Lead> {
  const r = id ? await api<{ lead: Lead }>(`/api/leads/${id}`, { method: 'PATCH', body }) : await api<{ lead: Lead }>('/api/leads', { body });
  set({ leads: id ? state.leads.map((l) => (l.id === id ? r.lead : l)) : [r.lead, ...state.leads] });
  return r.lead;
}

export async function deleteLead(id: string) {
  await api(`/api/leads/${id}`, { method: 'DELETE' });
  set({ leads: state.leads.filter((l) => l.id !== id) });
}

/** After a document was made from a lead the server moves its status, so read the list again next time. */
export const leadsChanged = () => { if (state.loaded) set({ loaded: false }); };

export const clearLeads = () => set({ leads: [], loaded: false, loading: false, error: '' });
