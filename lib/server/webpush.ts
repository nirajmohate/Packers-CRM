import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'crypto';

/**
 * Web Push without extra packages: message encryption (RFC 8291, aes128gcm) and the VAPID sign-in (RFC 8292),
 * with Node's own crypto. The phone's browser gives us an endpoint plus two keys; only that browser can read the message.
 *
 * Keys come from the environment (make them once with `node scripts/vapid-keys.mjs`):
 *   VAPID_PUBLIC_KEY   65-byte public key, base64url
 *   VAPID_PRIVATE_KEY  32-byte private key, base64url
 *   VAPID_SUBJECT      mailto: address push services can contact (optional)
 */

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export interface PushMessage { title: string; body: string; url?: string; tag?: string }

const b64u = (b: Buffer) => b.toString('base64url');
const unb64u = (s: string) => Buffer.from(s, 'base64url');
const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

export function pushConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

/** Push services the server is allowed to call (so a stored endpoint can never point the server elsewhere). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function isPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Encrypts the message for one browser (one record, aes128gcm). */
/** (salt and senderKey are only passed in by the self-test against RFC 8291's example) */
export function encryptPayload(target: Pick<PushTarget, 'p256dh' | 'auth'>, plaintext: Buffer, salt = randomBytes(16), senderKey?: Buffer) {
  const uaPublic = unb64u(target.p256dh);
  const authSecret = unb64u(target.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const ecdh = createECDH('prime256v1');
  if (senderKey) ecdh.setPrivateKey(senderKey); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** Short-lived signed token that tells the push service the message is from us. */
function vapidAuth(endpoint: string) {
  const pub = unb64u(vapidPublicKey());
  const d = process.env.VAPID_PRIVATE_KEY || '';
  if (pub.length !== 65) throw new Error('VAPID_PUBLIC_KEY is not a valid key');
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d }, format: 'jwk' });
  const head = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: process.env.VAPID_SUBJECT || 'mailto:info@cloudpackers.com',
  })));
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapidPublicKey()}`;
}

/**
 * Sends one notification. Returns the push service's HTTP status
 * (201 = sent; 404 / 410 = this phone unsubscribed, delete it; 0 = network error).
 */
export async function sendPush(target: PushTarget, msg: PushMessage, ttlSeconds = 12 * 3600): Promise<number> {
  if (!pushConfigured() || !isPushEndpoint(target.endpoint)) return 0;
  const payload = Buffer.from(JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 300), url: msg.url || '/', tag: msg.tag || '' }));
  try {
    const res = await fetch(target.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        TTL: String(ttlSeconds),
        Urgency: 'normal',
        Authorization: vapidAuth(target.endpoint),
      },
      body: encryptPayload(target, payload),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch {
    return 0;
  }
}
