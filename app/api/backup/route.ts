import { NextResponse } from 'next/server';
import { api } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Branch, Doc, Settings } from '@/lib/server/models';

/** Full JSON copy of the business data (no passwords). For safekeeping or moving servers. */
export const GET = api({ auth: 'admin' }, async ({ user }) => {
  const [branches, settings, docs] = await Promise.all([Branch.find({}).lean(), Settings.find({}).lean(), Doc.find({}).lean()]);
  await audit(user, { action: 'backup', entity: 'import', summary: `Downloaded a backup (${docs.length} documents)` });
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), branches, settings, docs }), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="packers-crm-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store' },
  });
});

export const dynamic = 'force-dynamic';
