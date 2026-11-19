import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Asset, Branch } from '@/lib/server/models';
import { decodeImage } from '@/lib/server/shared';

const Body = z.object({ kind: z.enum(['logo', 'stamp', 'signature']), scope: z.string().max(40), dataUrl: z.string().max(1_500_000), ratio: z.number().min(0.05).max(20) });

export const POST = api({ auth: 'admin' }, async ({ req, user }) => {
  const b = await jsonBody(req, Body);
  if (b.scope !== 'global' && !(Types.ObjectId.isValid(b.scope) && (await Branch.findById(b.scope).lean()))) throw new ApiError(404, 'Branch not found');
  const { mime, buf } = decodeImage(b.dataUrl);
  const a = await Asset.create({ kind: b.kind, scope: b.scope, mime, size: buf.length, ratio: b.ratio, data: buf, createdBy: user.id });
  await audit(user, { action: 'upload', entity: 'asset', entityId: String(a._id), branchId: b.scope === 'global' ? undefined : b.scope, summary: `Uploaded ${b.kind} (${Math.round(buf.length / 1024)} KB)` });
  return { id: String(a._id), ratio: b.ratio };
});

export const dynamic = 'force-dynamic';
