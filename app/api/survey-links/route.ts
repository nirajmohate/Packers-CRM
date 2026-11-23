import { z } from 'zod';
import { api, jsonBody } from '@/lib/server/http';
import { createLink, listLinks } from '@/lib/server/surveyLinks';

const Body = z.object({ branchId: z.string().max(40).optional(), customerName: z.string().max(120).optional(), customerPhone: z.string().max(20).optional() });

/** Survey links made for customers (newest first). */
export const GET = api({ auth: 'user' }, async ({ req, user }) => ({ links: await listLinks(user, req.nextUrl.searchParams.get('branch')) }));

/** Make a new one-time link. The link itself is returned only here, once. */
export const POST = api({ auth: 'user' }, async ({ req, user }) => createLink(user, await jsonBody(req, Body)));

export const dynamic = 'force-dynamic';
