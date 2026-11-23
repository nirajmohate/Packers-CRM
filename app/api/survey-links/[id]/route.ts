import { api } from '@/lib/server/http';
import { cancelLink } from '@/lib/server/surveyLinks';

/** Cancel a link that was not used yet (for example, sent to the wrong number). */
export const DELETE = api({ auth: 'user' }, async ({ user, params }) => { await cancelLink(user, params.id); return { ok: true }; });

export const dynamic = 'force-dynamic';
