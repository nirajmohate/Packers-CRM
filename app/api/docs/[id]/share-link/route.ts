import { api } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { shareableDoc } from '@/lib/server/docs';
import { makeShareToken } from '@/lib/server/shareLinks';
import { BY_SLUG } from '@/lib/config';

/** Makes a read-only PDF link for one document the user may open (same branch and type rules as opening it). */
export const POST = api({ auth: 'user' }, async ({ user, params }) => {
  const d = await shareableDoc(user, params.id);
  const { token, expiresAt } = makeShareToken(d.id);
  await audit(user, { action: 'share', entity: 'doc', entityId: d.id, docType: d.type, docNumber: d.number, branchId: d.branchId, summary: `Made a customer PDF link for ${BY_SLUG[d.type]?.title ?? d.type} ${d.number}` });
  return { path: `/p/${token}`, expiresAt };
});

export const dynamic = 'force-dynamic';
