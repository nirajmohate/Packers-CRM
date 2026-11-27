import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { hashPassword, passwordProblem, setSessionCookie, signSession, startSession, toSessionUser } from '@/lib/server/auth';
import { Branch, Settings, User } from '@/lib/server/models';
import { BRANCH_PRESETS, COMPANY_EMAIL } from '@/lib/branchPresets';

export const GET = api({ auth: 'none' }, async () => ({ needsSetup: (await User.countDocuments()) === 0 }));

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  loginId: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, 'Use 3 to 60 letters, numbers or . _ - @'),
  password: z.string().min(1).max(200),
  companyName: z.string().trim().max(120).optional(),
});

/**
 * First run only (never again, for anyone): creates the admin with the password typed here, adds the
 * 17 Cloud Packers branches with their contact details, and signs the admin in.
 */
export const POST = api({ auth: 'none' }, async ({ req }) => {
  if ((await User.countDocuments()) > 0) throw new ApiError(403, 'Setup is already done. Please sign in.');
  const b = await jsonBody(req, Body);
  const problem = passwordProblem(b.password, b.loginId);
  if (problem) throw new ApiError(422, problem, { password: problem });
  // one-time lock: if two people press "Create" at the same moment, only the first one goes through
  try { await Settings.create({ _id: 'setup-done', profile: {}, rules: {}, terms: {} }); } catch { throw new ApiError(403, 'Setup is already done. Please sign in.'); }
  await Settings.updateOne({ _id: 'global' }, { $set: { ...(b.companyName ? { 'profile.name': b.companyName } : {}), 'profile.email': COMPANY_EMAIL } }, { upsert: true });
  if ((await Branch.countDocuments()) === 0) {
    await Branch.insertMany(BRANCH_PRESETS.map((p) => ({ name: p.name, code: p.code, city: p.city, address: p.address, phone: p.phone, phone2: p.phone2 ?? '', active: true })));
  }
  const u = await User.create({ name: b.name, loginId: b.loginId, passwordHash: await hashPassword(b.password), role: 'admin', branchId: null, active: true, mustChangePassword: false, sv: 0, lastLoginAt: new Date() });
  const user = toSessionUser(u.toObject());
  await audit(user, { action: 'create', entity: 'user', entityId: user.id, summary: `First-run setup: created admin ${b.loginId}` });
  const res = NextResponse.json({ user });
  setSessionCookie(res, req, await signSession({ id: user.id, role: 'admin', branchId: null, sv: 0, sid: await startSession(user.id, req.headers) }));
  return res;
});

export const dynamic = 'force-dynamic';
