'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, FolderOpen, Plus, Users, Settings, Truck, Wallet, BarChart3, Trash2, UserCog, Building2, ScrollText, DatabaseBackup, LogOut, KeyRound, UserCircle2, Loader2 } from 'lucide-react';
import { MODULES } from '@/lib/config';
import { boot, refresh, signOut, useBranches, useCompany, useLoadError, usePhase, useSession } from '@/lib/store';
import { BranchSelect, ModuleIcon, Sheet } from './ui';

const EXTRA = [
  { href: '/payments', label: 'Payments', Icon: Wallet },
  { href: '/reports', label: 'Reports', Icon: BarChart3 },
  { href: '/trash', label: 'Recycle bin', Icon: Trash2 },
];
const ADMIN = [
  { href: '/admin/users', label: 'Users', Icon: UserCog },
  { href: '/admin/branches', label: 'Branches', Icon: Building2 },
  { href: '/admin/audit', label: 'Audit log', Icon: ScrollText },
  { href: '/admin/import', label: 'Import old data', Icon: DatabaseBackup },
];
const BARE = ['/login', '/setup', '/change-password'];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const phase = usePhase();
  const loadError = useLoadError();
  const user = useSession();
  const co = useCompany();
  const branches = useBranches();
  const [sheet, setSheet] = useState<null | 'docs' | 'create' | 'account'>(null);
  const bare = BARE.includes(path);
  const admin = user?.role === 'admin';

  useEffect(() => { if (!bare) boot(); }, [bare]);
  useEffect(() => setSheet(null), [path]);
  useEffect(() => {
    if (phase === 'anon' && !bare) router.replace('/login' + (path === '/' ? '' : `?next=${encodeURIComponent(path)}`));
    if (phase === 'mustchange' && path !== '/change-password') router.replace('/change-password');
  }, [phase, bare, path, router]);
  // other people save documents too: refresh when you come back to the app and once a minute
  useEffect(() => {
    if (phase !== 'ready') return;
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, [phase]);

  if (bare) return <>{children}</>;
  if (phase === 'error')
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="text-lg font-bold text-slate-900">Cannot load your data</p>
          <p className="text-sm text-slate-600">{loadError}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  if (phase !== 'ready')
    return <div className="grid min-h-screen place-items-center text-slate-400"><Loader2 className="animate-spin" size={32} /></div>;

  const segs = path.split('/').filter(Boolean);
  const focused = segs[0] === 'docs' && segs.length >= 3;
  const myBranch = branches.find((b) => b.id === user?.branchId)?.name;

  const tab = (href: string, label: string, Icon: typeof Users, active: boolean) => (
    <Link href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-brand-700' : 'text-slate-500'}`}><Icon size={22} />{label}</Link>
  );
  const side = (href: string, label: string, Icon: typeof Users) => (
    <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${path === href ? 'bg-white font-semibold text-brand-800' : 'hover:bg-white/10'}`}><Icon size={18} />{label}</Link>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto bg-gradient-to-b from-brand-800 to-brand-600 p-4 text-white lg:flex">
        <Link href="/" className="mb-3 flex items-center gap-3 px-2 pt-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><Truck size={22} /></span>
          <span className="text-base font-bold leading-tight">{co.name}<br /><span className="text-xs font-normal text-white/70">Billing &amp; CRM</span></span>
        </Link>
        <BranchSelect dark className="mb-3 px-1" />
        <nav className="flex-1 space-y-1 text-sm">
          {side('/', 'Dashboard', LayoutDashboard)}
          {side('/customers', 'Customers', Users)}
          {EXTRA.map((e) => side(e.href, e.label, e.Icon))}
          <p className="px-3 pb-1 pt-4 text-xs text-white/60">Documents</p>
          {MODULES.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}`} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${segs[0] === 'docs' && segs[1] === m.slug ? 'bg-white font-semibold text-brand-800' : 'hover:bg-white/10'}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />{m.title}
              {m.isNew && <span className="rounded bg-red-500 px-1 text-[9px] font-bold uppercase text-white">New</span>}
            </Link>
          ))}
          {admin && (<><p className="px-3 pb-1 pt-4 text-xs text-white/60">Admin</p>{ADMIN.map((e) => side(e.href, e.label, e.Icon))}{side('/settings', 'Settings', Settings)}</>)}
        </nav>
        <button onClick={() => setSheet('account')} className="mt-3 flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 text-left text-sm hover:bg-white/20">
          <UserCircle2 size={22} /><span className="min-w-0"><span className="block truncate font-semibold">{user?.name}</span><span className="block truncate text-xs text-white/70">{admin ? 'Admin' : `Manager${myBranch ? ' · ' + myBranch : ''}`}</span></span>
        </button>
      </aside>

      {!focused && (
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white"><Truck size={18} /></span>
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{co.name}</p>
          <BranchSelect className="w-44 shrink-0" />
        </header>
      )}

      <main className={`mx-auto max-w-6xl px-4 py-4 lg:px-8 lg:py-6 ${focused ? 'pb-28' : 'pb-28 lg:pb-10'}`}>{children}</main>

      {!focused && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {tab('/', 'Home', LayoutDashboard, path === '/')}
          <button onClick={() => setSheet('docs')} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"><FolderOpen size={22} />Documents</button>
          <div className="flex flex-1 justify-center">
            <button onClick={() => setSheet('create')} aria-label="Create new" className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/40 active:scale-95"><Plus size={28} /></button>
          </div>
          {tab('/payments', 'Payments', Wallet, path === '/payments')}
          {admin ? tab('/settings', 'Settings', Settings, path === '/settings') : (
            <button onClick={() => setSheet('account')} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"><UserCircle2 size={22} />Account</button>
          )}
        </nav>
      )}

      <Sheet open={sheet === 'docs' || sheet === 'create'} onClose={() => setSheet(null)} title={sheet === 'create' ? 'Create new' : 'Documents'}>
        <div className="grid grid-cols-3 gap-3">
          {MODULES.map((m) => (
            <Link key={m.slug} href={sheet === 'create' ? `/docs/${m.slug}/new` : `/docs/${m.slug}`} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-3 text-center active:bg-slate-50">
              <ModuleIcon cfg={m} /><span className="text-xs font-medium leading-tight text-slate-700">{m.title}</span>
            </Link>
          ))}
        </div>
        {sheet === 'docs' && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            {[{ href: '/customers', label: 'Customers', Icon: Users }, ...EXTRA, ...(admin ? ADMIN : [])].map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 active:bg-slate-50"><Icon size={18} />{label}</Link>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'account'} onClose={() => setSheet(null)} title="Account">
        <div className="mb-4 rounded-2xl bg-slate-50 p-4">
          <p className="font-semibold text-slate-900">{user?.name}</p>
          <p className="text-sm text-slate-500">Login ID: {user?.loginId}</p>
          <p className="text-sm text-slate-500">{admin ? 'Admin, all branches' : `Branch manager${myBranch ? ', ' + myBranch : ''}`}</p>
        </div>
        <div className="grid gap-3">
          <Link href="/change-password?voluntary=1" className="btn-ghost"><KeyRound size={17} />Change password</Link>
          <button className="btn-danger" onClick={() => signOut()}><LogOut size={17} />Sign out</button>
        </div>
      </Sheet>
    </div>
  );
}
