import { api } from '@/lib/server/http';
import { previewNumber } from '@/lib/server/docs';

export const GET = api({ auth: 'user' }, async ({ req, user }) => {
  const q = req.nextUrl.searchParams;
  return previewNumber(user, q.get('type') || '', q.get('branchId') || undefined, q.get('date') || '');
});

export const dynamic = 'force-dynamic';
