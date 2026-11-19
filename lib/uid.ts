/** Works on http LAN addresses too, where crypto.randomUUID does not exist. */
export const uid = () =>
  globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
