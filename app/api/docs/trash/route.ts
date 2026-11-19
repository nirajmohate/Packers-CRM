import { api, ApiError } from '@/lib/server/http';
import { emptyTrash, listTrash } from '@/lib/server/docs';

export const GET = api({ auth: 'user' }, async ({ user }) => ({ docs: await listTrash(user) }));
export const DELETE = api({ auth: 'user' }, async ({ user }) => {
  if (user.role !== 'admin') throw new ApiError(403, 'Only the admin can empty the recycle bin');
  return { removed: await emptyTrash(user) };
});

export const dynamic = 'force-dynamic';
