import { api, jsonBody } from '@/lib/server/http';
import { createDoc, listDocs } from '@/lib/server/docs';
import { DocBody, defaultSince } from '@/lib/server/shared';

export const GET = api({ auth: 'user' }, async ({ req, user }) => {
  const q = req.nextUrl.searchParams;
  return { docs: await listDocs(user, { since: q.get('since') || defaultSince(), branchId: q.get('branch') || undefined }) };
});

export const POST = api({ auth: 'user' }, async ({ req, user }) => ({ doc: await createDoc(user, await jsonBody(req, DocBody)) }));

export const dynamic = 'force-dynamic';
