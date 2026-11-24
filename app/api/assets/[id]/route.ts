import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { api, ApiError } from '@/lib/server/http';
import { Asset } from '@/lib/server/models';

export const GET = api({ auth: 'user' }, async ({ user, params }) => {
  if (!Types.ObjectId.isValid(params.id)) throw new ApiError(404, 'Not found');
  const a = await Asset.findById(params.id).lean();
  if (!a) throw new ApiError(404, 'Not found');
  if (user.role !== 'admin' && a.scope !== 'global' && a.scope !== user.branchId) throw new ApiError(404, 'Not found');
  const data = (a.data as { buffer?: Uint8Array } & Uint8Array);
  const bytes = Buffer.from((data.buffer ?? data) as ArrayBufferLike);
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': String(a.mime), 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' } });
});

export const dynamic = 'force-dynamic';
