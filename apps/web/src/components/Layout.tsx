import { createContext, useContext, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { BookOpen, PenTool, Cookie, FolderKanban, LayoutGrid, Layers, LogOut, Mic, Moon, Network, Package, Plus, Route, Settings, Shield, Sparkles, Sun, Trophy, Truck } from 'lucide-react';
import { DEFAULT_APP_LAYOUT, type Me } from '@sv/shared';
import { post } from '../api/client';
import { useAppLayout, useResetSession, useSession } from '../api/hooks';
import { openCookiePreferences } from '../lib/cookieConsent';
import { useTheme } from '../lib/theme';
import { Logo } from '../pages/auth/Auth';
import { NotificationBell } from './NotificationBell';
import { NewProductModal } from './NewProductModal';
import { NewProjectModal } from './journey/NewProjectModal';
import { QuickActions } from './QuickActions';
import { VoiceDictationModal } from './VoiceDictationModal';
import { useToast } from './Toast';
import { Button, cx, IconButton } from './ui';

const NewProductCtx = createContext<() => void>(() => {});
export const useNewProduct = () => useContext(NewProductCtx);

const VoiceDictationCtx = createContext<() => void>(() => {});
export const useVoiceDictation = () => useContext(VoiceDictationCtx);

const NAV = [
  { to: '/', label: 'Journey', icon: Route, end: true },
  { to: '/designs', label: 'Design Studio', icon: PenTool },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles }
];

/** Secondary destinations, grouped in the account/workspace menu. */
const SECONDARY_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/teamwork-graph', label: 'Teamwork Graph', icon: Network },
  { to: '/materials', label: 'Materials', icon: Layers },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/achievements', label: 'Achievements', icon: Trophy },
  { to: '/help', label: 'Help Centre', icon: BookOpen }
];

function WorkspaceMenu() {
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
    <div className="relative" onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        setOpen(false);
        event.currentTarget.querySelector('button')?.focus();
      }
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Account and workspace menu"
        title={`${me.user.name} · ${me.workspace.name}`}
        className={cx('flex w-full items-center justify-center rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60', open && 'relative z-40')}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600/10 text-xs font-semibold text-blue-700 dark:text-blue-300">
          {me.user.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute right-0 top-full z-40 mt-2 max-h-[calc(100dvh-5rem)] w-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
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
            <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Explore</p>
            {SECONDARY_NAV.map((item) => (
              <button
                key={item.to}
                onClick={() => {
                  setOpen(false);
                  navigate(item.to);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <item.icon className="h-4 w-4 text-zinc-400" /> {item.label}
              </button>
            ))}
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

function WorkspaceHeader({ onNew, onVoice }: { onNew: () => void; onVoice: () => void }) {
  const me = useSession();
  const navigation = me.demo ? NAV.slice(0, 1) : NAV;
  return (
    <header className="relative z-40 shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-h-14 items-center lg:min-h-16"><Logo className="gap-1 sm:gap-3" /></div>
        <nav aria-label="Main" className="col-span-2 row-start-2 mb-2 flex w-full gap-1 rounded-xl bg-zinc-100 p-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:mb-0 lg:w-auto dark:bg-zinc-800/70">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx(
              'flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 text-center text-xs font-semibold leading-tight outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 sm:px-4 sm:text-sm lg:flex-none',
              isActive ? 'bg-white text-[#16598d] shadow-sm dark:bg-zinc-700 dark:text-blue-200' : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-700/70'
            )}>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="col-start-2 row-start-1 flex items-center justify-end gap-0.5 sm:gap-2 lg:col-start-3">
          {me.workspace.role !== 'member' && (
            <Button size="sm" aria-label="New project" icon={<Plus className="h-4 w-4" />} onClick={onNew}>
              <span className="hidden sm:inline">New project</span>
            </Button>
          )}
          {!me.demo && <IconButton label="Voice capture" onClick={onVoice}><Mic className="h-4 w-4" /></IconButton>}
          <NotificationBell />
          <WorkspaceMenu />
        </div>
      </div>
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
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { data: appLayout } = useAppLayout();
  const layout = appLayout ?? DEFAULT_APP_LAYOUT;

  return (
    <NewProductCtx.Provider value={() => setNewOpen(true)}>
      <VoiceDictationCtx.Provider value={() => setVoiceOpen(true)}>
        <div className="flex h-full min-w-0 flex-col">
          <WorkspaceHeader onNew={() => setNewProjectOpen(true)} onVoice={() => setVoiceOpen(true)} />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#f6f8fa] dark:bg-zinc-950">
            {me.demo && <DemoNotice expiresAt={me.demo.expiresAt} />}
            <div className={cx('h-full min-h-full', layout.contentWidth === 'constrained' && 'mx-auto w-full max-w-7xl')}><Outlet /></div>
          </main>
        </div>
        <QuickActions onNew={() => setNewOpen(true)} />
        {newOpen && <NewProductModal onClose={() => setNewOpen(false)} />}
        {newProjectOpen && <NewProjectModal onClose={() => setNewProjectOpen(false)} />}
        {voiceOpen && <VoiceDictationModal onClose={() => setVoiceOpen(false)} />}
      </VoiceDictationCtx.Provider>
    </NewProductCtx.Provider>
  );
}
