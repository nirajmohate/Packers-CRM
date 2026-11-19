import { api, jsonBody } from '@/lib/server/http';
import { ImportBody, importLegacy } from '@/lib/server/importer';
import { Settings } from '@/lib/server/models';

export const GET = api({ auth: 'admin' }, async () => {
  const m = (await Settings.findById('meta').lean()) as { rules?: { importedAt?: string; report?: unknown } } | null;
  return { importedAt: m?.rules?.importedAt ?? null, report: m?.rules?.report ?? null };
});
export const POST = api({ auth: 'admin' }, async ({ req, user }) => ({ report: await importLegacy(user, await jsonBody(req, ImportBody)) }));

export const dynamic = 'force-dynamic';
