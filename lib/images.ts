import type { Company } from './types';

const cache = new Map<string, Promise<string | undefined>>();

/** Downloads a stored image once and keeps it as a data URL (what the PDF engine needs). */
export function loadImage(id: string): Promise<string | undefined> {
  if (!id) return Promise.resolve(undefined);
  if (!cache.has(id)) {
    cache.set(id, fetch(`/api/assets/${id}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('missing image'))))
      .then((b) => new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = rej; f.readAsDataURL(b); }))
      .catch(() => { cache.delete(id); return undefined; }));
  }
  return cache.get(id)!;
}

export async function loadCompanyImages(co: Pick<Company, 'logoId' | 'stampId' | 'signatureId'>) {
  const [logo, stamp, signature] = await Promise.all([loadImage(co.logoId), loadImage(co.stampId), loadImage(co.signatureId)]);
  return { logo, stamp, signature };
}
