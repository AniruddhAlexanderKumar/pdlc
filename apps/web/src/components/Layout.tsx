import { createContext, useContext, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { ChevronsUpDown, Flame, LayoutGrid, Layers, LogOut, Moon, Package, Plus, Settings, Sun, Trophy, Truck } from 'lucide-react';
import type { Me } from '@sv/shared';
import { post } from '../api/client';
import { useGame, useResetSession, useSession, useWorkspaceData } from '../api/hooks';
import { useTheme } from '../lib/theme';
import { Logo } from '../pages/auth/Auth';
import { LevelUpWatcher } from './Celebrate';
import { NewProductModal } from './NewProductModal';
import { useToast } from './Toast';
import { Button, cx, IconButton, ProgressBar } from './ui';

const NewProductCtx = createContext<() => void>(() => {});
export const useNewProduct = () => useContext(NewProductCtx);

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/products', label: 'Products', icon: Package },
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
      className="block rounded-xl border border-zinc-200 bg-gradient-to-br from-indigo-500/5 to-transparent p-3 transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:hover:border-indigo-500/40"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">
          Lv {data.level} · <span className="text-indigo-600 dark:text-indigo-400">{data.levelTitle}</span>
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

function WorkspaceMenu() {
  const me = useSession();
  const resetSession = useResetSession();
  const toast = useToast();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const switchWs = useMutation({
    mutationFn: (workspaceId: string) => post<Me>('/auth/switch-workspace', { workspaceId }),
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
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/10 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          {me.user.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{me.user.name}</p>
          <p className="truncate text-[11px] text-zinc-500">{me.workspace.name}</p>
        </div>
        <ChevronsUpDown className="h-4 w-4 text-zinc-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute bottom-full left-0 z-40 mb-2 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Workspaces</p>
            {me.workspaces.map((w) => (
              <button
                key={w.id}
                disabled={w.id === me.workspace.id}
                onClick={() => {
                  setOpen(false);
                  switchWs.mutate(w.id);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:cursor-default disabled:bg-indigo-500/10 dark:hover:bg-zinc-800"
              >
                <span className="truncate">{w.name}</span>
                <span className="text-[11px] text-zinc-400">{w.role}</span>
              </button>
            ))}
            <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
            <button
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Settings className="h-4 w-4 text-zinc-400" /> Settings & team
            </button>
            <button onClick={toggle} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              {theme === 'dark' ? <Sun className="h-4 w-4 text-zinc-400" /> : <Moon className="h-4 w-4 text-zinc-400" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              onClick={() => logout.mutate()}
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

export function Layout() {
  const [newOpen, setNewOpen] = useState(false);
  const { data } = useWorkspaceData();
  const { theme, toggle } = useTheme();
  const counts: Record<string, number | undefined> = {
    '/products': data?.products.length,
    '/materials': data?.materials.length,
    '/suppliers': data?.suppliers.length
  };

  return (
    <NewProductCtx.Provider value={() => setNewOpen(true)}>
      <div className="flex h-full flex-col md:flex-row">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex h-14 items-center border-b border-zinc-200/80 px-4 dark:border-zinc-800/80">
            <Logo />
          </div>
          <div className="p-3">
            <Button className="w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
              New product
            </Button>
          </div>
          <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-2.5">
                      <n.icon className={cx('h-4 w-4', isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400')} />
                      {n.label}
                    </span>
                    {counts[n.to] !== undefined && <span className="text-[11px] tabular-nums text-zinc-400">{counts[n.to]}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto space-y-2 border-t border-zinc-200/80 p-3 dark:border-zinc-800/80">
            <PlayerCard />
            <WorkspaceMenu />
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 md:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <Logo />
          <div className="flex items-center gap-1">
            <IconButton label="Toggle theme" onClick={toggle}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>
            <NavLink to="/settings" className="rounded-lg p-1.5 text-zinc-500" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </NavLink>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewOpen(true)}>
              New
            </Button>
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-200 bg-white/95 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/95"
          aria-label="Main"
        >
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500')
              }
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      {newOpen && <NewProductModal onClose={() => setNewOpen(false)} />}
      <LevelUpWatcher />
    </NewProductCtx.Provider>
  );
}
