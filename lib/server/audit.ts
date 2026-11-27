import type { AuditChange, SessionUser } from '../types';
import { Audit } from './models';

export interface AuditInput {
  action: string;
  entity: 'doc' | 'user' | 'branch' | 'settings' | 'asset' | 'auth' | 'import' | 'lead' | 'complaint';
  entityId?: string;
  docType?: string;
  docNumber?: string;
  branchId?: string;
  summary: string;
  changes?: AuditChange[];
}

/** Audit writes never block the real action. */
export async function audit(user: Pick<SessionUser, 'id' | 'name' | 'role'> | null, e: AuditInput, fallbackName = 'System') {
  try {
    await Audit.create({
      at: new Date(), userId: user?.id, userName: user?.name ?? fallbackName, role: user?.role ?? '-',
      ...e, changes: (e.changes ?? []).slice(0, 60),
    });
  } catch (err) {
    console.error('[audit] could not write entry', err);
  }
}

/** "Chrome on Android · 49.36.x.x": which device and network a sign-in came from (shown in the audit log). */
export function deviceOf(h: Headers): string {
  const ua = h.get('user-agent') || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'unknown device';
  const ip = ((h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '').slice(0, 45).replace(/[^0-9a-fA-F.:]/g, '');
  return `${browser} on ${os}${ip ? ` · IP ${ip}` : ''}`;
}
