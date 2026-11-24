import { ApiError } from './http';
import { User } from './models';
import type { SessionUser } from '../types';

type Rec = Record<string, unknown>;

/** Admin manages everyone; a branch owner only their own branch's Team account; the team nobody. */
export function mayManage(actor: SessionUser, target: Rec) {
  if (actor.role === 'admin') return;
  if (actor.role === 'manager' && target.role === 'team' && String(target.branchId ?? '') === actor.branchId) return;
  throw new ApiError(403, 'You can only manage the Team account of your own branch');
}

/** Only one Team account per branch (it can be signed in on many phones at once). */
export async function oneTeamPerBranch(branchId: string | null, exceptId?: string) {
  if (!branchId) return;
  const other = await User.findOne({ role: 'team', branchId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
  if (other) throw new ApiError(409, `This branch already has a Team account (${String(other.loginId)}). Reset its password or switch it on instead.`, { role: 'One Team account per branch' });
}
