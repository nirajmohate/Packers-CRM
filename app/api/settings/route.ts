import { api, jsonBody } from '@/lib/server/http';
import { bundleFor, loadBundle, saveSettings, SettingsUpdate } from '@/lib/server/settings';

export const GET = api({ auth: 'user' }, async ({ user }) => ({ settings: bundleFor(user, await loadBundle()) }));
export const PUT = api({ auth: 'admin' }, async ({ req, user }) => {
  await saveSettings(user, await jsonBody(req, SettingsUpdate));
  return { settings: bundleFor(user, await loadBundle()) };
});

export const dynamic = 'force-dynamic';
