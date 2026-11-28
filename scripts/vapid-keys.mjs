// Makes the two keys for phone notifications. Run once:  node scripts/vapid-keys.mjs
// Put both lines in Vercel → Settings → Environment Variables (and in .env.local for local testing), then redeploy.
// Keep VAPID_PRIVATE_KEY secret. If you ever change the keys, every phone has to turn notifications on again.
import { createECDH } from 'crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
console.log(`VAPID_PUBLIC_KEY=${ecdh.getPublicKey().toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${ecdh.getPrivateKey().toString('base64url')}`);
