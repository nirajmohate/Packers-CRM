import type { Field } from './types';

export const isVisible = (f: Pick<Field, 'showIf'>, data: Record<string, string>) => {
  const s = f.showIf;
  if (!s) return true;
  const v = data[s.key] ?? '';
  if (s.in && !s.in.includes(v)) return false;
  if (s.notIn && s.notIn.includes(v)) return false;
  return true;
};
