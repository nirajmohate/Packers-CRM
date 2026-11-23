import type { Company } from './types';
import { BRAND } from './brand';

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

/** Same as loadImage, for a file shipped with the app (public folder). */
function loadStatic(path: string): Promise<string | undefined> {
  const key = 'static:' + path;
  if (!cache.has(key)) {
    cache.set(key, fetch(path)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('missing image'))))
      .then((b) => new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = rej; f.readAsDataURL(b); }))
      .catch(() => { cache.delete(key); return undefined; }));
  }
  return cache.get(key)!;
}

/** Company images for the PDF. With no logo uploaded in Settings, the Cloud Packers logo is used. */
export async function loadCompanyImages(co: Pick<Company, 'logoId' | 'stampId' | 'signatureId'>) {
  const [uploaded, stamp, signature] = await Promise.all([loadImage(co.logoId), loadImage(co.stampId), loadImage(co.signatureId)]);
  if (uploaded) return { logo: uploaded, stamp, signature };
  const logo = await loadStatic(BRAND.logo);
  return { logo, logoRatio: logo ? BRAND.logoRatio : undefined, stamp, signature };
}
