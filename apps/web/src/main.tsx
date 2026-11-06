import { StrictMode, Suspense, lazy, useEffect, useRef } from 'react';
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
const AssistantPage = lazy(() => import('./pages/Assistant').then(m => ({ default: m.AssistantPage })));
import { AssistantAdminPage } from './pages/admin/AssistantAdmin';
import { DashboardPage } from './pages/Dashboard';
import { LandingPage } from './pages/Landing';
import { MaterialsPage } from './pages/Materials';
import { ProductPage } from './pages/product/ProductPage';
import { ProductsPage } from './pages/Products';
import { ProjectsPage } from './pages/Projects';
import { ProjectIssuesPage } from './pages/ProjectIssues';
const TeamworkGraphPage = lazy(() => import('./pages/TeamworkGraph').then(m => ({ default: m.TeamworkGraphPage })));
import { RequestAccessPage } from './pages/RequestAccess';
import { HelpCentrePage } from './pages/HelpCentre';
import { HelpAdminPage } from './pages/admin/HelpAdmin';
import { ExternalReviewPage } from './pages/ExternalReview';
import { ExternalReviewsPage } from './pages/ExternalReviews';
import { TryDemoPage } from './pages/TryDemo';
import { SettingsPage } from './pages/Settings';
import { WorkspaceSetupPage } from './pages/WorkspaceSetup';
import { DesignEditorPage, DesignStudioPage } from './pages/DesignStudio';
import { CadDocumentsPage, CadDocumentPage } from './pages/CadDocuments';
import { SuppliersPage } from './pages/Suppliers';
import { CookieBanner } from './components/CookieBanner';
import { useAnalyticsPageView } from './lib/analytics';

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
  // The root is the public front door: anyone without a session sees the marketing page, and it stays
  // readable even when the API is unreachable. Every other route still needs a session.
  if (!data && location.pathname === '/') return <LandingPage />;
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
  // System admins also have a workspace membership and may use its dashboard and settings.
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
  if (!data.user.isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

// A fragment-only navigation can open a different review without reloading the SPA.
// Remount the isolated viewer for a new token so no previous review/session remains visible.
function ReviewRoute() {
  const { hash } = useLocation();
  const lastToken = useRef('');
  if (/^#[A-Za-z0-9_-]{43}$/.test(hash)) lastToken.current = hash.slice(1);
  return <ExternalReviewPage key={lastToken.current} />;
}

// This is deliberately not a login or a console. There is no founder access until
// the separate server-side security boundary has been implemented and verified.
function FoundersUnavailable() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Founders Console unavailable</h1>
      <p className="mt-4">Founder sign-in and administrative access have not been enabled.</p>
    </main>
  );
}

function GuestOnly() {
  const { data, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner />;
  if (data) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : data.user.isAdmin ? '/admin' : '/'} replace />;
  }
  return <Outlet />;
}

function RootApp() {
  const location = useLocation();
  useEffect(() => {
    const pathname = location.pathname.replace(/\/+$/, '') || '/';
    const publicPage = pathname === '/' || pathname === '/request-access';
    const pageName = ({ '/request-access': 'Request Early Access', '/login': 'Sign In', '/signup': 'Create Account', '/register': 'Create Account', '/try-demo': 'Sample Workspace', '/products': 'Products', '/projects': 'Projects', '/teamwork-graph': 'Teamwork Graph', '/materials': 'Materials', '/suppliers': 'Suppliers', '/settings': 'Settings', '/achievements': 'Achievements', '/admin': 'Administration' } as Record<string, string>)[pathname];
    const title = pathname === '/' ? 'Solution Velocity | Engineering Product Development Lifecycle Management' : `${/^\/founders(?:\/|$)/i.test(pathname) ? 'Founders Console unavailable' : pageName ?? 'Engineering Workspace'} | Solution Velocity`;
    const description = pathname === '/request-access' ? 'Request early access to Solution Velocity and tell us about your engineering workflow.' : 'Bring product and project work together for engineering teams, students and educational organisations with Solution Velocity.';
    document.title = title;
    const set = (selector: string, value: string) => document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value);
    set('meta[name="description"]', description);
    set('meta[name="robots"]', publicPage ? 'index,follow' : 'noindex,nofollow');
    set('meta[property="og:title"]', title); set('meta[property="og:description"]', description);
    set('meta[name="twitter:title"]', title); set('meta[name="twitter:description"]', description);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      if (publicPage) { canonical.href = `https://pdlc.dalvigroup.co.in${pathname}`; set('meta[property="og:url"]', canonical.href); }
      else { canonical.removeAttribute('href'); set('meta[property="og:url"]', `https://pdlc.dalvigroup.co.in${pathname}`); }
    }
  }, [location.pathname]);
  useAnalyticsPageView();
  return (
    <>
      <Outlet />
      {location.pathname !== '/review' && !/^\/founders(?:\/|$)/i.test(location.pathname) && <CookieBanner />}
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootApp />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <AuthPage mode="login" /> },
          { path: '/signup', element: <AuthPage mode="register" /> },
          { path: '/register', element: <AuthPage mode="register" /> }
        ]
      },
      { path: '/join/:token', element: <JoinPage /> },
      { path: '/reset', element: <ResetPage /> },
      { path: '/reset/:token', element: <ResetPage /> },
      { path: '/request-access', element: <RequestAccessPage /> },
      { path: '/review', element: <ReviewRoute /> },
      { path: '/founders/*', element: <FoundersUnavailable /> },
      { path: '/contact', element: <Navigate to="/request-access" replace /> },
      { path: '/demo', element: <Navigate to="/try-demo" replace /> },
      { path: '/try-demo', element: <TryDemoPage /> },
      {
        element: <RequireAdmin />,
        children: [
          { path: '/admin', element: <AdminDashboard /> },
          { path: '/admin/help', element: <HelpAdminPage /> },
          { path: '/admin/assistant', element: <AssistantAdminPage /> },
          { path: '/analytics', element: <AdminDashboard /> }
        ]
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/products', element: <ProductsPage /> },
              { path: '/projects', element: <ProjectsPage /> },
              { path: '/designs', element: <DesignStudioPage /> },
              { path: '/designs/:id', element: <DesignEditorPage /> },
              { path: '/designs/cad', element: <CadDocumentsPage /> },
              { path: '/designs/cad/:id', element: <CadDocumentPage /> },
              { path: '/assistant', element: <Suspense fallback={<Spinner label="Loading AI Assistant" />}><AssistantPage /></Suspense> },
              { path: '/help', element: <HelpCentrePage /> },
              { path: '/help/:slug', element: <HelpCentrePage /> },
              { path: '/external-reviews', element: <ExternalReviewsPage /> },
              { path: '/teamwork-graph', element: <Suspense fallback={<Spinner label="Loading Teamwork Graph" />}><TeamworkGraphPage /></Suspense> },
              { path: '/projects/:projectId/issues', element: <ProjectIssuesPage /> },
              { path: '/products/:id', element: <ProductPage /> },
              { path: '/products/:id/:tab', element: <ProductPage /> },
              { path: '/materials', element: <MaterialsPage /> },
              { path: '/suppliers', element: <SuppliersPage /> },
              { path: '/achievements', element: <AchievementsPage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '/workspace-setup', element: <WorkspaceSetupPage /> },
              { path: '*', element: <Navigate to="/" replace /> }
            ]
          }
        ]
      }
    ]
  }
]);

// Remove the obsolete browser preference from earlier versions.
try { localStorage.removeItem('sv-language'); localStorage.removeItem('sv-public-language'); } catch { /* Storage may be unavailable. */ }

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
