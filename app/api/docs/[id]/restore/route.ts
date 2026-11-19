import { api } from '@/lib/server/http';
import { restoreDoc } from '@/lib/server/docs';

export const POST = api({ auth: 'user' }, async ({ user, params }) => ({ doc: await restoreDoc(user, params.id) }));

export const dynamic = 'force-dynamic';
