import { createHmac, timingSafeEqual } from 'crypto';
import { authSecret } from './env';

/*
 * Read-only PDF links for one document, sent to the customer on WhatsApp or email.
 * The link carries the document id and an expiry date, signed with the server secret (HMAC-SHA256),
 * so it cannot be changed to open another document. It stops working when it expires or when the
 * document is deleted. Nothing is stored, and the link never gives access to anything else.
 */
export const SHARE_DAYS = 90;

const sig = (payload: string) => createHmac('sha256', Buffer.from(authSecret())).update('doc-share|' + payload).digest('base64url').slice(0, 32);

export function makeShareToken(docId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SHARE_DAYS * 86400;
  const payload = `${docId}.${exp.toString(36)}`;
  return { token: `${payload}.${sig(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Returns the document id, or null when the link was changed, is malformed or has expired. */
export function readShareToken(token: string, now = Date.now()): string | null {
  const m = /^([a-f0-9]{24})\.([a-z0-9]{4,10})\.([A-Za-z0-9_-]{32})$/.exec(String(token || ''));
  if (!m) return null;
  const want = Buffer.from(sig(`${m[1]}.${m[2]}`));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (parseInt(m[2], 36) * 1000 < now) return null;
  return m[1];
}
