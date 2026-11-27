import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { authSecret } from './env';

/*
 * Two-step login with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…):
 * standard TOTP (RFC 6238): 6 digits, 30-second steps, SHA-1. No extra package and nothing to pay for.
 * The secret is stored encrypted (AES-256-GCM with a key made from AUTH_SECRET), so a copy of the
 * database alone is not enough to make codes.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32(randomBytes(20));

export function codeAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  msg.writeUInt32BE(step % 2 ** 32, 4);
  const h = createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Returns the time step the code belongs to (now, or 30 s either side for a slow phone clock), or null. Codes already used are refused. */
export function checkCode(secret: string, code: string, lastStep = 0, now = Date.now()): number | null {
  const c = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    if (s <= lastStep) continue; // the same code cannot be used twice
    const want = Buffer.from(codeAt(secret, s));
    if (timingSafeEqual(want, Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = 'Cloud Packers CRM') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

const key = () => createHash('sha256').update(Buffer.from(authSecret())).update('two-step-login').digest();

export function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function unseal(box: string) {
  const [iv, tag, enc] = String(box ?? '').split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/** 8 one-time backup codes (for a lost phone); only their hashes are kept. */
export function newBackupCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const r = base32(randomBytes(6)).slice(0, 8).toLowerCase();
    return `${r.slice(0, 4)}-${r.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashBackup) };
}
export const hashBackup = (c: string) => createHash('sha256').update('backup|' + String(c).toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
