export class ApiFail extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public code?: string) { super(message); }
}

/** Small fetch wrapper: JSON in and out, same-origin cookie, readable errors. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    if (typeof window !== 'undefined') {
      const here = window.location.pathname;
      if (res.status === 401 && !['/login', '/setup'].includes(here)) window.location.href = '/login?next=' + encodeURIComponent(here + window.location.search);
      else if (json?.code === 'must_change_password' && here !== '/change-password') window.location.href = '/change-password';
    }
    throw new ApiFail(res.status, json?.error ?? res.statusText ?? 'Request failed', json?.fields, json?.code);
  }
  return json as T;
}
