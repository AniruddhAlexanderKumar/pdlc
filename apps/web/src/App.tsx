import React, { useState, useEffect, useCallback } from 'react';
import { api, setAuthToken } from './lib/api';
import { Header } from './components/Header';
import { GlobalSearchModal } from './components/GlobalSearchModal';

import { DashboardView } from './views/DashboardView';
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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
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

  // Global search & navigation
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // 1. Initial Authentication & Data Hydration
  const initializeAuthAndData = useCallback(async () => {
    setLoading(true);
    try {
      // Auto-authenticate as Lead Systems Engineer for immediate first-run experience
      const authRes = await api.login({
        email: 'engineer@nexgen.os',
        password: 'password123',
      });
      setAuthToken(authRes.token);
      setCurrentUser(authRes.user);

      // Hydrate authoritative database data
      await refreshData();
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

  return (
    <div className="h-screen w-full flex flex-col bg-black text-surface-200 font-sans selection:bg-brand/30">
      {/* Persistent Technical Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onResetDemo={handleResetDemo}
        user={currentUser}
      />

      {/* Main Mission Control Workspace */}
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

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectResult={handleSelectSearchResult}
        projectId={projectId}
      />
    </div>
  );
};
