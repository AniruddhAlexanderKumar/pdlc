import React, { useState, useEffect, useCallback } from 'react';
import { api, setAuthToken } from './lib/api';
import { Header } from './components/Header';
import { GlobalSearchModal } from './components/GlobalSearchModal';

import { DashboardView } from './views/DashboardView';
import { WidgetBoardView } from './views/WidgetBoardView';
import { RequirementsView } from './views/RequirementsView';
import { ArchitectureView } from './views/ArchitectureView';
import { VerificationView } from './views/VerificationView';
import { ChangeControlView } from './views/ChangeControlView';
import { RiskView } from './views/RiskView';
import { QualityView } from './views/QualityView';
import { BaselineView } from './views/BaselineView';
import { ReleaseView } from './views/ReleaseView';
import { DocumentsView } from './views/DocumentsView';
import { TasksView } from './views/TasksView';
import { AuditView } from './views/AuditView';
import { CommercialAdminView } from './views/CommercialAdminView';
import { GuidedNewProjectModal } from './components/GuidedNewProjectModal';
import { EngineeringAssistantModal } from './components/EngineeringAssistantModal';

// Public Experience & Auth
import { PublicLandingView } from './views/PublicLandingView';
import { AuthModal } from './components/auth/AuthModal';
import { AccountSettingsModal } from './components/auth/AccountSettingsModal';
import { NotificationDrawer } from './components/notifications/NotificationDrawer';

export const App: React.FC = () => {
  // Top-level Navigation Mode: 'public' (SaaS Landing & Marketing) vs 'workspace' (Engineering OS)
  const [viewMode, setViewMode] = useState<'public' | 'workspace'>('public');
  const [publicPath, setPublicPath] = useState('/');

  // Active Engineering Workspace Tab.
  // The rearrangable widget board is the workspace landing surface; the
  // telemetry dashboard remains one click away (01 Telemetry).
  const [activeTab, setActiveTab] = useState('board');
  const [projectId] = useState('PRJ-AERO-01');
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Authoritative server state
  const [telemetry, setTelemetry] = useState<any>(null);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [architecture, setArchitecture] = useState<any[]>([]);
  const [verification, setVerification] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [nonconformances, setNonconformances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Drawers
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // 1. Initial Authentication & Data Hydration
  const initializeAuthAndData = useCallback(async () => {
    setLoading(true);
    try {
      // Auto-authenticate as Lead Systems Engineer for immediate first-run evaluation
      const authRes = await api.login({
        email: 'engineer@nexgen.os',
        password: 'password123',
      });
      setAuthToken(authRes.token);
      setCurrentUser(authRes.user);

      // Hydrate authoritative database data
      await refreshData();
      await fetchNotificationCount();
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const refreshData = async () => {
    try {
      const [telemetryData, reqsData, archData, vrfData, rskData, ncData] = await Promise.all([
        api.getTelemetry(projectId),
        api.getRequirements(projectId),
        api.getArchitecture(projectId),
        api.getVerificationProcs(projectId),
        api.getRisks(projectId),
        api.getNonconformances(projectId),
      ]);

      setTelemetry(telemetryData);
      setRequirements(reqsData);
      setArchitecture(archData);
      setVerification(vrfData);
      setRisks(rskData);
      setNonconformances(ncData);
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  const fetchNotificationCount = async () => {
    try {
      const list = await api.getNotifications();
      if (Array.isArray(list)) {
        setUnreadCount(list.filter((n) => !n.isRead).length);
      }
    } catch (err) {
      // Non-blocking
    }
  };

  useEffect(() => {
    initializeAuthAndData();
  }, [initializeAuthAndData]);

  // Keyboard shortcut Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResetDemo = async () => {
    if (!window.confirm('Reset database to authentic demo state?')) return;
    try {
      await api.resetDemo();
      await refreshData();
      setActiveTab('dashboard');
    } catch (err: any) {
      alert(`Reset error: ${err.message}`);
    }
  };

  const handleSelectSearchResult = (targetTab: string, objectId: string) => {
    setActiveTab(targetTab);
    if (targetTab === 'reqs') {
      setSelectedReqId(objectId);
    }
  };

  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    refreshData();
    fetchNotificationCount();
    setViewMode('workspace');
  };

  const handleLogout = () => {
    setAuthToken(null);
    setCurrentUser(null);
    setIsSettingsOpen(false);
    setViewMode('public');
  };

  return (
    <div className="h-screen w-full flex flex-col bg-black text-surface-200 font-sans selection:bg-brand/30">
      {/* VIEW MODE 1: PUBLIC PORTAL & MARKETING SITE */}
      {viewMode === 'public' ? (
        <div className="flex-1 overflow-y-auto">
          <PublicLandingView
            currentPath={publicPath}
            onNavigate={(path) => setPublicPath(path)}
            onEnterWorkspace={() => setViewMode('workspace')}
            onSignInSuccess={handleAuthSuccess}
            onOpenSignIn={() => {
              setPublicPath('/signin');
            }}
            onOpenSignUp={() => {
              setAuthModalMode('register');
              setIsAuthModalOpen(true);
            }}
          />
        </div>
      ) : (
        /* VIEW MODE 2: AUTHENTICATED ENGINEERING WORKSPACE */
        <div className="h-screen w-full flex flex-col bg-black overflow-hidden">
          {/* Persistent Technical Top Header */}
          <Header
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onOpenSearch={() => setIsSearchOpen(true)}
            onResetDemo={handleResetDemo}
            onOpenGuide={() => setIsGuideOpen(true)}
            onOpenNewProject={() => setIsNewProjectOpen(true)}
            onTogglePublic={() => setViewMode('public')}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSignOut={handleLogout}
            unreadNotificationsCount={unreadCount}
            user={currentUser}
          />

          {/*
            Widget Board owns the main region itself: the reference board in
            `components/ui/draggable-widget-grid-demo.tsx` renders a full page
            (its own <main>), and a page must only ever contain one.
          */}
          {activeTab === 'board' ? (
            <WidgetBoardView
              telemetry={telemetry}
              loading={loading}
              onNavigate={setActiveTab}
            />
          ) : (
          /* Main Mission Control Workspace */
          <main className="flex-1 relative overflow-hidden bg-black">
            {activeTab === 'dashboard' && (
              <DashboardView
                telemetry={telemetry}
                loading={loading}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'reqs' && (
              <RequirementsView
                requirements={requirements}
                architecture={architecture}
                verification={verification}
                risks={risks}
                projectId={projectId}
                onRefresh={refreshData}
                selectedId={selectedReqId}
                onSelectId={setSelectedReqId}
              />
            )}

            {activeTab === 'arch' && (
              <ArchitectureView
                architecture={architecture}
                requirements={requirements}
                projectId={projectId}
                onRefresh={refreshData}
                onNavigateToReqs={() => setActiveTab('reqs')}
              />
            )}

            {activeTab === 'verify' && (
              <VerificationView
                verification={verification}
                requirements={requirements}
                projectId={projectId}
                onRefresh={refreshData}
                onNavigateToNC={() => setActiveTab('quality')}
              />
            )}

            {activeTab === 'change' && (
              <ChangeControlView
                requirements={requirements}
                architecture={architecture}
                projectId={projectId}
                onRefresh={refreshData}
              />
            )}

            {activeTab === 'risk' && (
              <RiskView
                risks={risks}
                requirements={requirements}
                architecture={architecture}
                projectId={projectId}
                onRefresh={refreshData}
              />
            )}

            {activeTab === 'quality' && (
              <QualityView
                nonconformances={nonconformances}
                projectId={projectId}
                onRefresh={refreshData}
              />
            )}

            {activeTab === 'baselines' && <BaselineView projectId={projectId} />}

            {activeTab === 'release' && (
              <ReleaseView projectId={projectId} onRefresh={refreshData} />
            )}

            {activeTab === 'documents' && <DocumentsView projectId={projectId} />}

            {activeTab === 'tasks' && <TasksView projectId={projectId} />}

            {activeTab === 'audit' && <AuditView projectId={projectId} />}

            {activeTab === 'commercial' && (
              <CommercialAdminView currentUser={currentUser} onRefresh={refreshData} />
            )}
          </main>
          )}
        </div>
      )}

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
        projectId={projectId}
      />

      {/* Beginner Guided Project Setup Wizard */}
      <GuidedNewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onProjectCreated={async () => {
          await refreshData();
          setActiveTab('dashboard');
        }}
      />

      {/* In-App Engineering Assistant / Copilot Modal */}
      <EngineeringAssistantModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        telemetry={telemetry}
        onNavigate={(tab) => setActiveTab(tab)}
      />

      {/* Auth Modal (Login / Register / Forgot / Reset Password) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* User Account & Security Settings Modal */}
      <AccountSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        onUserUpdated={(updated) => setCurrentUser(updated)}
        onLogout={handleLogout}
      />

      {/* In-App Notification Center Drawer */}
      <NotificationDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigateTab={(tab) => {
          setViewMode('workspace');
          setActiveTab(tab);
        }}
        onNotificationsChanged={fetchNotificationCount}
      />
    </div>
  );
};
