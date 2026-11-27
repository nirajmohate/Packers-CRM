import type { Branch } from '../types';

export const branchOut = (b: Record<string, unknown>): Branch => ({
  id: String(b._id), name: String(b.name), code: String(b.code), city: String(b.city ?? ''), address: String(b.address ?? ''), phone: String(b.phone ?? ''), phone2: String(b.phone2 ?? ''), active: b.active !== false,
});

export const userOut = (u: Record<string, unknown>) => ({
  id: String(u._id), name: String(u.name), loginId: String(u.loginId), role: u.role as string, branchId: u.branchId ? String(u.branchId) : null,
  active: u.active !== false, mustChangePassword: false, lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt as string).toISOString() : null,
  locked: !!(u.lockUntil && new Date(u.lockUntil as string).getTime() > Date.now()),
});
