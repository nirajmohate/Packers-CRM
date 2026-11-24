'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDown, Link2, List, LayoutDashboard, FolderOpen, Plus, Users, UserPlus, Settings, Wallet, BarChart3, Trash2, UserCog, Building2, ScrollText, DatabaseBackup, LogOut, KeyRound, UserCircle2, Loader2 } from 'lucide-react';
import { MODULES as ALL_MODULES } from '@/lib/config';
import { ROLE_LABEL, canSee, canUseType, type Area, type Role } from '@/lib/roles';
import { boot, refresh, signOut, useBranches, useLoadError, usePhase, useSession } from '@/lib/store';
import { BranchSelect, Hi, ModuleIcon, Sheet } from './ui';
import { BRAND } from '@/lib/brand';

const EXTRA: { href: string; label: string; Icon: typeof Wallet; area: Area }[] = [
  { href: '/payments', label: 'Payments', Icon: Wallet, area: 'payments' },
  { href: '/reports', label: 'Reports', Icon: BarChart3, area: 'reports' },
  { href: '/trash', label: 'Recycle bin', Icon: Trash2, area: 'trash' },
];
const ADMIN: { href: string; label: string; Icon: typeof UserCog; area: Area }[] = [
  { href: '/admin/users', label: 'Users', Icon: UserCog, area: 'users' },
  { href: '/admin/branches', label: 'Branches', Icon: Building2, area: 'branches' },
  { href: '/admin/audit', label: 'Audit log', Icon: ScrollText, area: 'audit' },
  { href: '/admin/import', label: 'Import old data', Icon: DatabaseBackup, area: 'import' },
];
const BARE = ['/login', '/setup', '/change-password'];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const phase = usePhase();
  const loadError = useLoadError();
  const user = useSession();
  const branches = useBranches();
  const [sheet, setSheet] = useState<null | 'docs' | 'create' | 'account'>(null);
  // which document's dropdown is open in the side menu (the one you are working in opens by itself)
  const [openMod, setOpenMod] = useState<string | null>(null);
  useEffect(() => { const s = path.split('/'); if (s[1] === 'docs' && s[2]) setOpenMod(s[2]); }, [path]);
  /** Already on the survey list: open the share panel there instead of navigating. */
  const shareSurvey = (e: React.MouseEvent) => {
    if (path !== '/docs/survey') return;
    e.preventDefault();
    setSheet(null);
    window.dispatchEvent(new Event('pm-share-survey'));
  };
  const bare = BARE.includes(path) || path.startsWith('/s/');
  const admin = user?.role === 'admin';
  // each role sees only the document types and pages it can use (the server checks the same rules)
  const MODULES = ALL_MODULES.filter((m) => canUseType(user, m.slug));
  const see = (a: Area) => canSee(user, a);
  const roleText = user ? (user.role === 'admin' ? 'Admin, all branches' : `${ROLE_LABEL[user.role as Role] ?? user.role}`) : '';

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
  const myBranch = branches.find((b) => b.id === user?.branchId)?.name;

  const tab = (href: string, label: string, Icon: typeof Users, active: boolean) => (
    <Link href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-brand-700' : 'text-slate-500'}`}><Icon size={22} />{label}</Link>
  );
  const side = (href: string, label: string, Icon: typeof Users) => (
    <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${path === href ? 'bg-white font-semibold text-brand-800' : 'hover:bg-white/10'}`}>
      <Icon size={18} /><span className="min-w-0 flex-1 leading-tight">{label}<Hi t={label} className={`block text-[11px] ${path === href ? 'text-slate-500' : 'text-white/60'}`} /></span>
    </Link>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto bg-gradient-to-b from-brand-800 to-brand-600 p-4 text-white lg:flex">
        <Link href="/" className="mb-3 block rounded-2xl bg-white px-3 pb-2 pt-3 text-center shadow-sm" aria-label={`${BRAND.name} home`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt={BRAND.name} width={200} height={124} className="mx-auto h-auto w-32" />
          <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-800">Billing &amp; CRM</span>
        </Link>
        <BranchSelect dark className="mb-3 px-1" />
        <nav className="flex-1 space-y-1 text-sm">
          {side('/', 'Dashboard', LayoutDashboard)}
          {see('customers') && (() => {
            const here = segs[0] === 'customers';
            const isOpen = openMod === 'customers';
            const sub = (href: string, label: string, hi: string, Icon: typeof Users) => (
              <Link href={href} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-white/90 hover:bg-white/10"><Icon size={15} /><span className="leading-tight">{label}<span lang="hi" className="block text-[11px] text-white/60">{hi}</span></span></Link>
            );
            return (
              <div className={`rounded-xl ${isOpen ? 'bg-white/10' : ''}`}>
                <button type="button" onClick={() => setOpenMod(isOpen ? null : 'customers')} aria-expanded={isOpen} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${here && !isOpen ? 'bg-white font-semibold text-brand-800' : 'hover:bg-white/10'}`}>
                  <Users size={18} /><span className="min-w-0 flex-1 leading-tight">Customers<Hi t="Customers" className={`block text-[11px] ${here && !isOpen ? 'text-slate-500' : 'text-white/60'}`} /></span>
                  <ChevronDown size={16} className={`shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && <div className="space-y-0.5 pb-1.5 pl-6 pr-1 pt-0.5">{sub('/customers?add=1', 'Add customer', 'ग्राहक जोड़ें', UserPlus)}{sub('/customers', 'Customer list', 'ग्राहक सूची', List)}</div>}
              </div>
            );
          })()}
          {EXTRA.filter((e) => see(e.area)).map((e) => side(e.href, e.label, e.Icon))}
          <p className="px-3 pb-1 pt-4 text-xs uppercase tracking-wide text-white/60">Documents · <span lang="hi">डॉक्यूमेंट</span></p>
          {MODULES.map((m) => {
            const here = segs[0] === 'docs' && segs[1] === m.slug;
            const isOpen = openMod === m.slug;
            const sub = (href: string, label: string, Icon: typeof Users, on: boolean) => (
              <Link href={href} onClick={href.endsWith('share=1') ? shareSurvey : undefined} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] ${on ? 'bg-white font-semibold text-slate-900' : 'text-white/90 hover:bg-white/10'}`}>
                <Icon size={15} style={{ color: on ? m.color : undefined }} /><span className="min-w-0 leading-tight">{label}<Hi t={label} className={`block text-[11px] ${on ? 'text-slate-500' : 'text-white/60'}`} /></span>
              </Link>
            );
            return (
              <div key={m.slug} className={`rounded-xl ${isOpen ? 'bg-white/10' : ''}`}>
                <button type="button" onClick={() => setOpenMod(isOpen ? null : m.slug)} aria-expanded={isOpen}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left ${here && !isOpen ? 'bg-white/15' : 'hover:bg-white/10'}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white"><ModuleIcon cfg={m} size={30} /></span>
                  <span className="min-w-0 flex-1 leading-tight"><span className={`block truncate ${here ? 'font-semibold' : ''}`}>{m.title}</span><Hi t={m.title} className="block truncate text-[11px] text-white/60" /></span>
                  <ChevronDown size={16} className={`shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="space-y-0.5 pb-1.5 pl-6 pr-1 pt-0.5">
                    {sub(`/docs/${m.slug}/new`, 'Add New', Plus, segs[2] === 'new' && here)}
                    {sub(`/docs/${m.slug}`, 'Go To List', List, here && !segs[2])}
                    {m.slug === 'survey' && sub('/docs/survey?share=1', 'Share survey link', Link2, false)}
                  </div>
                )}
              </div>
            );
          })}
          {ADMIN.some((e) => see(e.area)) && (<><p className="px-3 pb-1 pt-4 text-xs text-white/60">{admin ? 'Admin' : 'My branch'}</p>{ADMIN.filter((e) => see(e.area)).map((e) => side(e.href, admin || e.area !== 'users' ? e.label : 'My team', e.Icon))}{see('settings') && side('/settings', 'Settings', Settings)}</>)}
        </nav>
        <button onClick={() => setSheet('account')} className="mt-3 flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 text-left text-sm hover:bg-white/20">
          <UserCircle2 size={22} /><span className="min-w-0"><span className="block truncate font-semibold">{user?.name}</span><span className="block truncate text-xs text-white/70">{admin ? 'Admin' : `${roleText}${myBranch ? ' · ' + myBranch : ''}`}</span></span>
        </button>
      </aside>

      {(
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Link href="/" className="min-w-0 flex-1" aria-label={`${BRAND.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logo} alt={BRAND.name} width={72} height={45} className="h-10 w-auto" />
          </Link>
          <BranchSelect className="w-44 shrink-0" />
        </header>
      )}

      <main className="mx-auto max-w-7xl px-3 py-3 pb-28 sm:px-4 lg:px-6 lg:py-4 lg:pb-8">{children}</main>

      {(
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {tab('/', 'Home', LayoutDashboard, path === '/')}
          <button onClick={() => setSheet('docs')} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"><FolderOpen size={22} />Documents</button>
          <div className="flex flex-1 justify-center">
            <button onClick={() => setSheet('create')} aria-label="Create new" className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/40 active:scale-95"><Plus size={28} /></button>
          </div>
          {see('payments') && tab('/payments', 'Payments', Wallet, path === '/payments')}
          {admin ? tab('/settings', 'Settings', Settings, path === '/settings') : (
            <button onClick={() => setSheet('account')} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"><UserCircle2 size={22} />Account</button>
          )}
        </nav>
      )}

      <Sheet open={sheet === 'docs' || sheet === 'create'} onClose={() => setSheet(null)} title={sheet === 'create' ? 'Create new · नया बनाएं' : 'Documents · डॉक्यूमेंट'}>
        {sheet === 'create' ? (
          <div className="grid grid-cols-3 gap-3">
            {MODULES.map((m) => (
              <Link key={m.slug} href={`/docs/${m.slug}/new`} className="flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center active:bg-slate-50" style={{ borderColor: m.color + '55' }}>
                <ModuleIcon cfg={m} /><span className="text-xs font-semibold leading-tight text-slate-800">{m.title}</span><Hi t={m.title} className="text-[11px] text-slate-500" />
              </Link>
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {MODULES.map((m) => (
              <li key={m.slug} className="flex items-center gap-3 rounded-2xl border-2 p-2" style={{ borderColor: m.color + '40' }}>
                <ModuleIcon cfg={m} size={40} />
                <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-sm font-semibold text-slate-900">{m.title}</span><Hi t={m.title} className="block text-[11px] text-slate-500" /></span>
                <Link href={`/docs/${m.slug}/new`} className="btn min-h-[38px] px-3 text-xs text-white" style={{ background: m.color }}><Plus size={15} />New</Link>
                <Link href={`/docs/${m.slug}`} className="btn min-h-[38px] border-2 bg-white px-3 text-xs" style={{ borderColor: m.color, color: m.color }}><List size={15} />List</Link>
                {m.slug === 'survey' && <Link href="/docs/survey?share=1" onClick={shareSurvey} aria-label="Share survey link" className="btn min-h-[38px] bg-violet-600 px-2.5 text-xs text-white"><Link2 size={15} />Link</Link>}
              </li>
            ))}
          </ul>
        )}
        {sheet === 'docs' && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            {[{ href: '/customers', label: 'Customers', Icon: Users, area: 'customers' as Area }, ...EXTRA, ...ADMIN].filter((e) => see(e.area)).map(({ href, area, Icon, label: l }) => ({ href, Icon, label: !admin && area === 'users' ? 'My team' : l })).map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 active:bg-slate-50"><Icon size={18} />{label}</Link>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'account'} onClose={() => setSheet(null)} title="Account">
        <div className="mb-4 rounded-2xl bg-slate-50 p-4">
          <p className="font-semibold text-slate-900">{user?.name}</p>
          <p className="text-sm text-slate-500">Login ID: {user?.loginId}</p>
          <p className="text-sm text-slate-500">{admin ? 'Admin, all branches' : `${roleText}${myBranch ? ', ' + myBranch : ''}`}</p>
        </div>
        <div className="grid gap-3">
          {user?.role === 'team' ? <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">This is your branch&apos;s shared Team account. Ask your branch owner to change its password.</p> : <Link href="/change-password?voluntary=1" className="btn-ghost"><KeyRound size={17} />Change password</Link>}
          <button className="btn-danger" onClick={() => signOut()}><LogOut size={17} />Sign out</button>
        </div>
      </Sheet>
    </div>
  );
}
