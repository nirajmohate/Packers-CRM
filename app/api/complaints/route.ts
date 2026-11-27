import { api } from '@/lib/server/http';
import { Complaint } from '@/lib/server/models';
import { complaintOut, mayUseComplaints } from '@/lib/server/complaints';

/** Complaints: the admin sees all (and the ones waiting to be forwarded); a branch owner only their branch's. */
export const GET = api({ auth: 'user' }, async ({ user }) => {
  mayUseComplaints(user);
  const filter = user.role === 'admin' ? {} : { branchId: user.branchId };
  const rows = await Complaint.find(filter).sort({ createdAt: -1 }).limit(3000).lean();
  return { complaints: (rows as Record<string, unknown>[]).map((r: Record<string, unknown>) => complaintOut(r)) };
});

export const dynamic = 'force-dynamic';
