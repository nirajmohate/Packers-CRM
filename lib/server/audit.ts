import type { AuditChange, SessionUser } from '../types';
import { Audit } from './models';

export interface AuditInput {
  action: string;
  entity: 'doc' | 'user' | 'branch' | 'settings' | 'asset' | 'auth' | 'import';
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
