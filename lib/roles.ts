/**
 * Who can do what. The server checks every request against these rules; the screens only hide what the
 * person cannot use. Change access here, in one place.
 *
 *  admin   : everything, every branch.
 *  manager : "Branch owner (TSM)". Everything in their own branch, and manages their branch's Team account.
 *  team    : "Team (executives)". One shared account per branch, can be signed in on many phones at once.
 *            Only Quotation, LR / Bilty, Packing List, Survey List and Vehicle Condition, in their own branch.
 *            Can create, edit and change status; cannot delete, and cannot see bills, payments, reports,
 *            customers, the recycle bin, users or settings.
 */
export type Role = 'admin' | 'manager' | 'team';
export const ROLES: Role[] = ['admin', 'manager', 'team'];
export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', manager: 'Branch owner (TSM)', team: 'Team (executives)' };
export const ROLE_HI: Record<Role, string> = { admin: 'एडमिन', manager: 'ब्रांच मालिक', team: 'टीम' };

/** Document types the Team account can use. */
export const TEAM_TYPES = ['quotation', 'lr', 'packing', 'survey', 'vehicle'];

type Who = { role: string } | null | undefined;
export const isAdmin = (u: Who) => u?.role === 'admin';
export const isTeam = (u: Who) => u?.role === 'team';
/** branch owner or team: always limited to one branch */
export const isBranchUser = (u: Who) => u?.role === 'manager' || u?.role === 'team';

export const canUseType = (u: Who, type: string) => !!u && (u.role !== 'team' || TEAM_TYPES.includes(type));
export const canDelete = (u: Who) => !!u && u.role !== 'team';

/** Pages and areas outside the documents. */
export type Area = 'payments' | 'reports' | 'customers' | 'trash' | 'users' | 'settings' | 'branches' | 'audit' | 'import';
const AREAS: Record<Role, Area[]> = {
  admin: ['payments', 'reports', 'customers', 'trash', 'users', 'settings', 'branches', 'audit', 'import'],
  manager: ['payments', 'reports', 'customers', 'trash', 'users'],
  team: [],
};
export const canSee = (u: Who, area: Area) => !!u && (AREAS[u.role as Role] ?? []).includes(area);

/** URL → area, for the page guard in middleware.ts */
export function areaOfPath(path: string): Area | null {
  if (path.startsWith('/payments')) return 'payments';
  if (path.startsWith('/reports')) return 'reports';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/trash')) return 'trash';
  if (path.startsWith('/admin/users')) return 'users';
  if (path.startsWith('/settings')) return 'settings';
  if (path.startsWith('/admin/branches')) return 'branches';
  if (path.startsWith('/admin/audit')) return 'audit';
  if (path.startsWith('/admin/import')) return 'import';
  return null;
}
