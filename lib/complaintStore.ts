'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { Complaint } from './complaints';

/** Complaints are loaded when a page needs them (complaints page, dashboard card), for admin and branch owners only. */
let state: { list: Complaint[]; loaded: boolean; loading: boolean; error: string; at: number } = { list: [], loaded: false, loading: false, error: '', at: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<typeof state>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

export async function loadComplaints(force = false) {
  if (state.loading || (!force && state.loaded && Date.now() - state.at < 60_000)) return;
  set({ loading: true, error: '' });
  try { const r = await api<{ complaints: Complaint[] }>('/api/complaints'); set({ list: r.complaints, loaded: true, loading: false, at: Date.now() }); }
  catch (e) { set({ loading: false, loaded: true, error: (e as Error).message }); }
}

export function useComplaints(enabled = true) {
  useEffect(() => { if (enabled) void loadComplaints(); }, [enabled]);
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export async function updateComplaint(id: string, body: { status?: string; note?: string; branchId?: string }) {
  const r = await api<{ complaint: Complaint }>(`/api/complaints/${id}`, { method: 'PATCH', body });
  set({ list: state.list.map((c) => (c.id === id ? r.complaint : c)).filter((c) => c) });
  return r.complaint;
}
