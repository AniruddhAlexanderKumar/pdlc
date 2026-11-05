import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { BarChart3, BookOpen, PenTool, ChevronsUpDown, Cookie, Flame, FolderKanban, LayoutGrid, Layers, LogOut, Menu, Mic, Moon, Network, Package, Plus, Settings, Shield, Sparkles, Sun, Trophy, Truck } from 'lucide-react';
import { DEFAULT_APP_LAYOUT, NAV_FOCUS_PATHS, type Me } from '@sv/shared';
import { post } from '../api/client';
import { useAppLayout, useGame, useResetSession, useSession, useWorkspaceData, useWorkspaceProfile } from '../api/hooks';
import { openCookiePreferences } from '../lib/cookieConsent';
import { useTheme } from '../lib/theme';
import { Logo } from '../pages/auth/Auth';
import { LevelUpWatcher } from './Celebrate';
import { NewProductModal } from './NewProductModal';
import { QuickActions } from './QuickActions';
import { VoiceDictationModal } from './VoiceDictationModal';
import { useToast } from './Toast';
import { Button, cx, IconButton, ProgressBar } from './ui';

const NewProductCtx = createContext<() => void>(() => {});
export const useNewProduct = () => useContext(NewProductCtx);

const VoiceDictationCtx = createContext<() => void>(() => {});
export const useVoiceDictation = () => useContext(VoiceDictationCtx);

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/designs', label: 'Design Studio', icon: PenTool },
  { to: '/help', label: 'Help', icon: BookOpen },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/teamwork-graph', label: 'Teamwork Graph', icon: Network },
  { to: '/materials', label: 'Materials', icon: Layers },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/achievements', label: 'Achievements', icon: Trophy }
];

function PlayerCard() {
  const { data } = useGame();
  if (!data) return <div className="h-[74px] animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />;
  return (
    <NavLink
      to="/achievements"
      className="block rounded-xl border border-zinc-200 bg-gradient-to-br from-blue-500/5 to-transparent p-3 transition-colors hover:border-blue-300 dark:border-zinc-800 dark:hover:border-blue-500/40"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">
          Lv {data.level} · <span className="text-blue-600 dark:text-blue-400">{data.levelTitle}</span>
        </span>
        <span
          className={cx('flex items-center gap-0.5 font-semibold tabular-nums', data.streakDays > 0 ? 'text-orange-500' : 'text-zinc-400')}
          title={`${data.streakDays}-day streak`}
        >
          <Flame className="h-3.5 w-3.5" />
          {data.streakDays}
        </span>
      </div>
      <ProgressBar className="mt-2" value={(data.xpIntoLevel / data.xpForNextLevel) * 100} />
      <p className="mt-1.5 text-[11px] text-zinc-500 tabular-nums">
        {data.xpIntoLevel} / {data.xpForNextLevel} XP to level {data.level + 1}
      </p>
    </NavLink>
  );
}

function WorkspaceMenu({ compact = false, placement = 'above' }: { compact?: boolean; placement?: 'above' | 'below' }) {
  const me = useSession();
  const resetSession = useResetSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const switchWs = useMutation({
    mutationFn: (workspaceId: string) => post<Me>('/auth/switch-workspace', { workspaceId }),
    onError: () => window.dispatchEvent(new Event('sv:session-change-failed')),
    onSuccess: (m) => {
      resetSession(m);
      navigate('/');
      toast.success(`Switched to ${m.workspace.name}`);
    }
  });
  const logout = useMutation({
    mutationFn: () => post('/auth/logout'),
    onSettled: () => resetSession(null)
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account and workspace menu"
        title={compact ? `${me.user.name} · ${me.workspace.name}` : undefined}
        className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/60', compact && 'justify-center', open && 'relative z-40')}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-semibold text-blue-700 dark:text-blue-300">
          {me.user.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div className={cx('min-w-0 flex-1', compact && 'sr-only')}>
          <p className="truncate text-xs font-medium">{me.user.name}</p>
          <p className="truncate text-[11px] text-zinc-500">{me.workspace.name}</p>
        </div>
        {!compact && <ChevronsUpDown className="h-4 w-4 text-zinc-400" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={cx('animate-rise absolute z-40 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900', placement === 'below' ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2')}>
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Workspaces</p>
            {me.workspaces.map((w) => (
              <button
                key={w.id}
                disabled={w.id === me.workspace.id}
                onClick={() => {
                  if (!window.dispatchEvent(new Event('sv:before-session-change', { cancelable: true }))) return;
                  setOpen(false);
                  switchWs.mutate(w.id);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:cursor-default disabled:bg-blue-500/10 dark:hover:bg-zinc-800"
              >
                <span className="truncate">{w.name}</span>
                <span className="text-[11px] text-zinc-400">{w.role}</span>
              </button>
            ))}
            <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
            {me.user.isAdmin && (
              <button
                onClick={() => {
                  setOpen(false);
                  navigate('/admin');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-500/10 dark:text-blue-400"
              >
                <Shield className="h-4 w-4" /> Admin Console
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Settings className="h-4 w-4 text-zinc-400" /> Settings & team
            </button>
            <button
              onClick={() => {
                setOpen(false);
                openCookiePreferences();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Cookie className="h-4 w-4 text-zinc-400" /> Cookie preferences
            </button>
            <button onClick={toggle} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-zinc-400" /> : <Moon className="h-4 w-4 text-zinc-400" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              onClick={() => { if (window.dispatchEvent(new Event('sv:before-session-change', { cancelable: true }))) logout.mutate(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DesktopTopNavigation({ style, onNew, onVoice, navigation }: { style: 'tabs' | 'menu'; onNew: () => void; onVoice: () => void; navigation: typeof NAV }) {
  const me = useSession();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [style]);
  const links = [
    ...navigation,
    ...(me.user.isAdmin ? [{ to: '/admin', label: 'Admin Console', icon: Shield }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  return (
    <header className="relative z-40 hidden shrink-0 border-b border-slate-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-16 items-center gap-3 px-5">
        {style === 'menu' && (
          <div className="relative" onKeyDown={(event) => { if (event.key === 'Escape' && open) { setOpen(false); menuButton.current?.focus(); } }}>
            <button ref={menuButton} type="button" aria-label="Open navigation menu" aria-expanded={open} aria-controls="desktop-navigation-menu" onClick={() => setOpen((v) => !v)} className={cx('relative rounded-md p-2 hover:bg-slate-100 dark:hover:bg-zinc-800', open && 'z-40')}>
              <Menu className="h-5 w-5" />
            </button>
            {open && <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <nav id="desktop-navigation-menu" aria-label="Main" className="absolute left-0 top-full z-40 mt-2 max-h-[calc(100vh-5rem)] w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                {links.map((n) => <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800')}><n.icon className="h-4 w-4" />{n.label}</NavLink>)}
              </nav>
            </>}
          </div>
        )}
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNew}>{'New product'}</Button>
          {!me.demo && <IconButton label="Voice capture" onClick={onVoice}><Mic className="h-4 w-4 text-blue-600 dark:text-blue-400" /></IconButton>}
          <WorkspaceMenu compact placement="below" />
        </div>
      </div>
      {style === 'tabs' && <nav aria-label="Main" className="flex overflow-x-auto px-4">
        {links.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium', isActive ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-zinc-600 hover:text-blue-700 dark:text-zinc-400')}><n.icon className="h-4 w-4" />{n.label}</NavLink>)}
      </nav>}
    </header>
  );
}

function DemoNotice({ expiresAt }: { expiresAt: string }) {
  const toast = useToast();
  const exit = useMutation({ mutationFn: () => post('/auth/logout'), onSuccess: () => { window.location.assign('/'); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100" role="status"><p><strong>Temporary demo.</strong> Changes stay here and expire at {new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Don’t enter sensitive information; system administrators retain access. Voice and AI features are unavailable in the demo.</p><Button size="sm" variant="secondary" loading={exit.isPending} onClick={() => exit.mutate()}>Exit demo</Button></div>;
}

export function Layout() {
  const me = useSession();
  const [newOpen, setNewOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { data } = useWorkspaceData();
  const { data: appLayout } = useAppLayout();
  const { data: workspaceProfile } = useWorkspaceProfile();
  const priorities = (workspaceProfile?.profile?.navigation ?? []).map(id => NAV_FOCUS_PATHS[id]);
  const availableNav = me.demo ? NAV.filter(n => n.to !== '/designs') : NAV;
  const navigation = priorities.length ? [availableNav[0], ...priorities.flatMap(path => availableNav.filter(n => n.to === path)), ...availableNav.slice(1).filter(n => !priorities.includes(n.to))] : availableNav;
  const layout = appLayout ?? DEFAULT_APP_LAYOUT;
  const compact = layout.navigation === 'compact';
  const topNavigation = layout.navigation === 'tabs' || layout.navigation === 'menu';
  const { theme, toggle } = useTheme();
  const counts: Record<string, number | undefined> = {
    '/products': data?.products.length,
    '/materials': data?.materials.length,
    '/suppliers': data?.suppliers.length
  };

  return (
    <NewProductCtx.Provider value={() => setNewOpen(true)}>
      <VoiceDictationCtx.Provider value={() => setVoiceOpen(true)}>
        <div className={cx('flex h-full flex-col', !topNavigation && 'md:flex-row')}>
          {/* Desktop sidebar */}
          {!topNavigation && <aside className={cx('hidden shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-900', compact ? 'w-20' : 'w-64')}>
            <div className={cx('flex h-[72px] items-center border-b border-slate-100 dark:border-zinc-800', compact ? 'justify-center px-2' : 'px-5')}>
              {compact ? <span className="flex h-9 w-14 items-center justify-center rounded-md bg-white px-1"><img src="/solution-velocity-logo.png" alt="Solution Velocity" className="h-7 w-full object-contain" /></span> : <Logo />}
            </div>
            <div className={cx('space-y-2 pb-5 pt-5', compact ? 'px-3' : 'px-4')}>
              <Button className="w-full" aria-label="New product" title={compact ? 'New product' : undefined} icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
                {!compact && 'New product'}
              </Button>
              {!me.demo && <Button
                variant="secondary"
                aria-label="Voice capture"
                title={compact ? 'Voice capture' : undefined}
                className="w-full border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100/70 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
                icon={<Mic className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                onClick={() => setVoiceOpen(true)}
              >
                {!compact && 'Voice capture'}
              </Button>}
            </div>
          <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-3" aria-label="Main">
            {!compact && <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>}
            {me.user.isAdmin && (
              <NavLink
                to="/admin"
                title={compact ? 'Admin Console' : undefined}
                className={cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 dark:text-amber-400 dark:bg-amber-500/10 border border-amber-500/20 mb-1', compact && 'justify-center')}
              >
                <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className={compact ? 'sr-only' : undefined}>{'Admin Console'}</span>
              </NavLink>
            )}
            {navigation.filter(n => compact || priorities.includes(n.to) || !['/materials','/suppliers','/achievements'].includes(n.to)).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                title={compact ? n.label : undefined}
                className={({ isActive }) =>
                  cx(
                    'flex items-center justify-between rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors',
                    compact && 'justify-center',
                    isActive
                      ? 'bg-blue-50 text-[#16598d] dark:bg-blue-500/15 dark:text-blue-300'
                      : 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-2.5">
                      <n.icon className={cx('h-4 w-4', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400')} />
                      <span className={compact ? 'sr-only' : undefined}>{n.label}</span>
                    </span>
                    {!compact && counts[n.to] !== undefined && <span className="text-[11px] tabular-nums text-zinc-400">{counts[n.to]}</span>}
                  </>
                )}
              </NavLink>
            ))}
            {!compact && <details className="mt-1"><summary className="cursor-pointer rounded-md px-3 py-2 text-[13px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">More tools</summary><div className="ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-700">{navigation.filter(n=>!priorities.includes(n.to) && ['/materials','/suppliers','/achievements'].includes(n.to)).map(n=><NavLink key={n.to} to={n.to} className={({isActive})=>cx('flex items-center gap-2 rounded-md px-3 py-2 text-sm',isActive?'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300':'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800')}><n.icon className="h-4 w-4" />{n.label}</NavLink>)}</div></details>}
            <NavLink
              to="/settings"
              title={compact ? 'Settings' : undefined}
              className={({ isActive }) => cx(
                'flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors',
                compact && 'justify-center',
                isActive ? 'bg-blue-50 text-[#16598d] dark:bg-blue-500/15 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
              )}
            >
              <Settings className="h-4 w-4" /> <span className={compact ? 'sr-only' : undefined}>{'Settings'}</span>
            </NavLink>
          </nav>
          <div className={cx('mt-auto space-y-2 border-t border-zinc-200/80 dark:border-zinc-800/80', compact ? 'p-2' : 'p-4')}>
            {!compact && <PlayerCard />}
            <WorkspaceMenu compact={compact} />
          </div>
        </aside>}
        {topNavigation && <DesktopTopNavigation style={layout.navigation as 'tabs' | 'menu'} onNew={() => setNewOpen(true)} onVoice={() => setVoiceOpen(true)} navigation={navigation} />}

        {/* Mobile top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <Logo />
          <div className="flex items-center gap-1">
            <IconButton label="Toggle theme" onClick={toggle}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>
            {!me.demo && <IconButton label="Voice capture" onClick={() => setVoiceOpen(true)}>
              <Mic className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </IconButton>}
            <NavLink to="/settings" className="rounded-lg p-1.5 text-zinc-500" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </NavLink>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewOpen(true)}>
              New
            </Button>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f6f8fa] pb-20 md:pb-0 dark:bg-zinc-950">
          {me.demo && <DemoNotice expiresAt={me.demo.expiresAt} />}
          <div className={cx('h-full min-h-full', layout.contentWidth === 'constrained' && 'mx-auto w-full max-w-7xl')}><Outlet /></div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
          aria-label="Main"
        >
          {navigation.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex min-w-[76px] flex-1 shrink-0 flex-col items-center gap-1 px-1 py-2 text-center text-[10px] font-medium', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500')
              }
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <QuickActions onNew={() => setNewOpen(true)} />
      {newOpen && <NewProductModal onClose={() => setNewOpen(false)} />}
      {voiceOpen && <VoiceDictationModal onClose={() => setVoiceOpen(false)} />}
      <LevelUpWatcher />
    </VoiceDictationCtx.Provider>
  </NewProductCtx.Provider>
  );
}
