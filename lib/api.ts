export class ApiFail extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public code?: string) { super(message); }
}

/* "Type your password again" for sensitive actions: the app shell registers a dialog here. */
let confirmHandler: (() => Promise<boolean>) | null = null;
export const setConfirmHandler = (h: (() => Promise<boolean>) | null) => { confirmHandler = h; };
/** Asks for the password (if a dialog is available). Resolves false when the user cancels. */
export const ensureConfirmed = () => (confirmHandler ? confirmHandler() : Promise.resolve(false));

/** Small fetch wrapper: JSON in and out, same-origin cookie, readable errors. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}, retried = false): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiFail(0, 'Cannot reach the server. Check your internet connection and try again.');
  }
  let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    // sensitive action: ask for the password once, then try the same request again
    if (res.status === 428 && json?.code === 'confirm_password' && !retried && confirmHandler) {
      if (await confirmHandler()) return api<T>(path, opts, true);
      throw new ApiFail(428, 'Cancelled: your password is needed for this', undefined, 'confirm_cancelled');
    }
    if (typeof window !== 'undefined') {
      const here = window.location.pathname;
      if (res.status === 401 && !['/login', '/setup'].includes(here)) window.location.href = '/login?next=' + encodeURIComponent(here + window.location.search);
      else if (json?.code === 'must_change_password' && here !== '/change-password') window.location.href = '/change-password';
    }
    throw new ApiFail(res.status, json?.error ?? res.statusText ?? 'Request failed', json?.fields, json?.code);
  }
  return json as T;
}
