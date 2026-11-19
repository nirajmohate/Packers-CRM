export function mongoUri() {
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/packers_crm';
}

export function authSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET is missing or too short. Copy .env.example to .env.local and set AUTH_SECRET to a random string of at least 32 characters.');
  return new TextEncoder().encode(s);
}
