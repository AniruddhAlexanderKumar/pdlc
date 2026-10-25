import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import './index.css';
import './lib/theme';
import { ApiError } from './api/client';
import { keys, useMe } from './api/hooks';
import { CelebrateProvider } from './components/Celebrate';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { Button, ConfirmProvider, Spinner } from './components/ui';
import { AchievementsPage } from './pages/Achievements';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AuthPage, JoinPage, ResetPage } from './pages/auth/Auth';
import { DashboardPage } from './pages/Dashboard';
import { MaterialsPage } from './pages/Materials';
import { ProductPage } from './pages/product/ProductPage';
import { ProductsPage } from './pages/Products';
import { SettingsPage } from './pages/Settings';
import { SuppliersPage } from './pages/Suppliers';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2
    }
  }
});

// Any 401 means the session ended (expired, signed out elsewhere): drop back to sign-in.
queryClient.getQueryCache().subscribe((event) => {
  const err = event.query.state.error;
  if (event.type === 'updated' && err instanceof ApiError && err.status === 401 && event.query.queryKey[0] !== keys.me[0]) {
    queryClient.setQueryData(keys.me, null);
  }
});

function RequireAuth() {
  const { data, isLoading, error, refetch, isFetching } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">We couldn’t reach Solution Velocity. {(error as Error).message}</p>
        <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (data.user.isAdmin || data.user.email.toLowerCase() === 'admin@gmail.com') {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}

function RequireAdmin() {
  const { data, isLoading, error, refetch, isFetching } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">We couldn’t reach Solution Velocity. {(error as Error).message}</p>
        <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!data.user.isAdmin && data.user.email.toLowerCase() !== 'admin@gmail.com') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RequireAdmin() {
  const { data, isLoading, error, refetch, isFetching } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">We couldn’t reach Solution Velocity. {(error as Error).message}</p>
        <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!data.user.isAdmin && data.user.email.toLowerCase() !== 'admin@gmail.com') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function GuestOnly() {
  const { data, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (data) {
    if (data.user.email.toLowerCase() === 'admin@gmail.com' || data.user.isAdmin) {
      return <Navigate to="/admin" replace />;
    }
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return <Outlet />;
}

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/signup', element: <AuthPage mode="register" /> },
      { path: '/register', element: <AuthPage mode="register" /> },
      { path: '/reset/:token', element: <ResetPage /> }
    ]
  },
  { path: '/join/:token', element: <JoinPage /> },
  {
    element: <RequireAdmin />,
    children: [{ path: '/admin', element: <AdminDashboard /> }]
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/products', element: <ProductsPage /> },
          { path: '/products/:id', element: <ProductPage /> },
          { path: '/products/:id/:tab', element: <ProductPage /> },
          { path: '/materials', element: <MaterialsPage /> },
          { path: '/suppliers', element: <SuppliersPage /> },
          { path: '/achievements', element: <AchievementsPage /> },
          { path: '/settings', element: <SettingsPage /> },
          { path: '*', element: <Navigate to="/" replace /> }
        ]
      }
    ]
  }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CelebrateProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </CelebrateProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>
);
