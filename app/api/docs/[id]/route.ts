import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { getDoc, purgeDoc, setStatus, softDelete, updateDoc } from '@/lib/server/docs';
import { DocBody } from '@/lib/server/shared';

export const GET = api({ auth: 'user' }, async ({ user, params }) => ({ doc: await getDoc(user, params.id) }));
export const PUT = api({ auth: 'user' }, async ({ req, user, params }) => ({ doc: await updateDoc(user, params.id, await jsonBody(req, DocBody)) }));
export const PATCH = api({ auth: 'user' }, async ({ req, user, params }) => {
  const { status } = await jsonBody(req, z.object({ status: z.string().max(30) }));
  return { doc: await setStatus(user, params.id, status) };
});
export const DELETE = api({ auth: 'user' }, async ({ req, user, params }) => {
  if (req.nextUrl.searchParams.get('purge') === '1') {
    if (user.role !== 'admin') throw new ApiError(403, 'Only the admin can delete permanently');
    await purgeDoc(user, params.id);
  } else {
    const { reason } = await jsonBody(req, z.object({ reason: z.string().max(300) }));
    await softDelete(user, params.id, reason);
  }
});

export const dynamic = 'force-dynamic';
