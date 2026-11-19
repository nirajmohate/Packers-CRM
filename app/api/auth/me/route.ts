import { api } from '@/lib/server/http';

export const GET = api({ auth: 'user', allowMustChange: true }, async ({ user }) => ({ user }));

export const dynamic = 'force-dynamic';
