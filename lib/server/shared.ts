import { Types } from 'mongoose';
import { z } from 'zod';
import { fyOf } from '../numbering';
import { ApiError } from './http';
import { Branch } from './models';

export const DocBody = z.object({
  type: z.string().max(30), branchId: z.string().max(40).optional(), number: z.string().max(80).optional(), status: z.string().max(30).optional(),
  docDate: z.string().max(10), data: z.record(z.string(), z.any()), items: z.array(z.any()).max(300).optional(), rev: z.number().optional(),
  leadId: z.string().max(40).optional(),
});

/** Default window: this financial year and the previous one. */
export const defaultSince = () => `${Number(fyOf(new Date().toISOString().slice(0, 10)).slice(0, 4)) - 1}-04-01`;

export async function branchFor(role: string, branchId: string | null | undefined) {
  if (role === 'admin') return null;
  if (!branchId || !Types.ObjectId.isValid(branchId)) throw new ApiError(422, 'Choose a branch for this user', { branchId: 'Required' });
  const b = await Branch.findById(branchId).lean();
  if (!b || b.active === false) throw new ApiError(422, 'Choose an active branch', { branchId: 'Choose an active branch' });
  return String(b._id);
}

export const MAX_IMAGE_BYTES = 1_000_000;
export function decodeImage(dataUrl: string): { mime: string; buf: Buffer } {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new ApiError(422, 'Use a PNG, JPEG or WebP image');
  const buf = Buffer.from(m[2], 'base64');
  const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const jpg = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const webp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  if (!png && !jpg && !webp) throw new ApiError(422, 'That file is not a real image');
  if (buf.length > MAX_IMAGE_BYTES) throw new ApiError(422, 'Image is too large (limit 1 MB)');
  return { mime: m[1], buf };
}
