import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface CommercialAdminViewProps {
  currentUser: any;
  onRefresh: () => void;
}

export const CommercialAdminView: React.FC<CommercialAdminViewProps> = ({
  currentUser,
}) => {
  const [orgData, setOrgData] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Support ticket form
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Workflow Guidance');
  const [ticketSeverity, setTicketSeverity] = useState('Medium');
  const [submittingTicket, setSubmittingTicket] = useState(false);

  // Plan switch form
  const [submittingPlan, setSubmittingPlan] = useState(false);

  const loadCommercialData = async () => {
    setLoading(true);
    try {
      const [orgRes, memberRes, ticketRes] = await Promise.all([
        api.getOrganization(),
        api.getMembers(),
        api.getSupportTickets(),
      ]);
      setOrgData(orgRes);
      setMembers(memberRes);
      setTickets(ticketRes);
    } catch (err: any) {
      console.error('Failed to load commercial data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCommercialData();
  }, []);

  const handleUpdatePlan = async (newTier: string) => {
    if (!window.confirm(`Switch organization commercial tier to ${newTier}?`)) return;
    setSubmittingPlan(true);
    try {
      await api.updateSubscription({ planTier: newTier });
      await loadCommercialData();
    } catch (err: any) {
      alert(`Plan switch error: ${err.message}`);
    } finally {
      setSubmittingPlan(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTicket(true);
    try {
      await api.createSupportTicket({
        title: ticketTitle,
        description: ticketDesc,
        category: ticketCategory,
        severity: ticketSeverity,
      });
      setIsTicketModalOpen(false);
      setTicketTitle('');
      setTicketDesc('');
      await loadCommercialData();
    } catch (err: any) {
      alert(`Ticket submission error: ${err.message}`);
    } finally {
      setSubmittingTicket(false);
    }
  };

  if (loading || !orgData) {
    return (
      <div className="p-8 h-full flex items-center justify-center font-mono text-sm text-surface-400">
        <span className="w-2 h-2 bg-brand animate-ping mr-3"></span>
        LOADING COMMERCIAL TENANT SUBSCRIPTION & SECURITY CONTROLS...
      </div>
    );
  }

  const { organization, entitlements, plansAvailable } = orgData;

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-y-auto">
      <SectionHeader
        title="Commercial Packaging, Security & Organization Management"
        subtitle={`Organization: ${organization.name} [${organization.code}] | Current Tier: ${organization.planTier}`}
        icon="[ORG]"
        color="text-emerald-400"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
              Commercial Status:
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              {organization.subscriptionStatus.toUpperCase()} (SELF-CONTROLLED POSTGRES)
            </span>
          </div>
        }
      />

      {/* Grid: 3 Main Commercial Pillars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Subscription & Entitlement State */}
        <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col">
          <div className="flex justify-between items-center mb-4 border-b border-surface-800 pb-2">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Commercial Subscription
            </h3>
            <span className="text-emerald-400 font-mono text-xs font-bold">
              [{organization.planTier.toUpperCase()}]
            </span>
          </div>

          <div className="space-y-2 text-xs font-mono mb-4 flex-1">
            <div className="flex justify-between py-1 border-b border-surface-800/50">
              <span className="text-surface-400">Active Seats:</span>
              <span className="text-white font-bold">{members.length} / {organization.seatLimit} allocated</span>
            </div>
            <div className="flex justify-between py-1 border-b border-surface-800/50">
              <span className="text-surface-400">Max Projects:</span>
              <span className="text-white font-bold">{organization._count.projects} / {entitlements.maxProjects}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-surface-800/50">
              <span className="text-surface-400">CCB Impact Traversal:</span>
              <span className="text-emerald-400 font-bold">{entitlements.canManageCCB ? 'AUTHORIZED' : 'RESTRICTED'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-surface-800/50">
              <span className="text-surface-400">Release Gate Authority:</span>
              <span className="text-emerald-400 font-bold">{entitlements.canExecuteRelease ? 'AUTHORIZED' : 'RESTRICTED'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-surface-800/50">
              <span className="text-surface-400">Support SLA:</span>
              <span className="text-brand font-bold">{entitlements.supportSla}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-surface-800">
            <div className="text-[10px] font-mono text-surface-500 uppercase mb-2">
              Switch Commercial Tier:
            </div>
            <div className="grid grid-cols-3 gap-1">
              {['Starter', 'Professional', 'Enterprise'].map((tier) => (
                <button
                  key={tier}
                  disabled={submittingPlan || organization.planTier === tier}
                  onClick={() => handleUpdatePlan(tier)}
                  className={`px-2 py-1 text-[10px] font-mono font-bold uppercase transition-all ${
                    organization.planTier === tier
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-surface-900 text-surface-400 hover:text-white border border-surface-800 hover:border-surface-600'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Self-Controlled Data Governance */}
        <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col">
          <div className="flex justify-between items-center mb-4 border-b border-surface-800 pb-2">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Data Governance & Sovereignty
            </h3>
            <span className="text-brand font-mono text-xs font-bold">[AIR-GAPPED READY]</span>
          </div>

          <div className="space-y-2 text-xs font-mono mb-4 text-surface-300 flex-1">
            <div className="p-2.5 bg-surface-900/80 rounded border border-surface-800">
              <div className="text-brand font-bold text-[11px] mb-1">
                Zero Third-Party Database Lock-In
              </div>
              <p className="text-[10px] text-surface-400 leading-relaxed">
                Core records, requirements, drawings, test telemetry, and change orders reside exclusively within operator-managed PostgreSQL 17 on self-controlled infrastructure.
              </p>
            </div>

            <div className="p-2.5 bg-surface-900/80 rounded border border-surface-800">
              <div className="text-emerald-400 font-bold text-[11px] mb-1">
                FAA / EASA / Military Audit Trail
              </div>
              <p className="text-[10px] text-surface-400 leading-relaxed">
                Immutable SHA-256 artifact checksumming, deterministic stage-gate evaluations, and row-level actor audit history preserved across all baselines.
              </p>
            </div>
          </div>

          <div className="text-[10px] font-mono text-surface-500 text-right">
            Operator Tenant: {organization.id}
          </div>
        </div>

        {/* Card 3: Dedicated Support & Guidance Route */}
        <div className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col">
          <div className="flex justify-between items-center mb-4 border-b border-surface-800 pb-2">
            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Mission Support & Engineering SLA
            </h3>
            <button
              onClick={() => setIsTicketModalOpen(true)}
              className="text-[10px] font-mono font-bold px-2 py-0.5 bg-brand text-black hover:bg-brand-hover transition-colors"
            >
              + SUBMIT TICKET
            </button>
          </div>

          <div className="text-xs font-mono text-surface-400 mb-3">
            Open Support Inquiries ({tickets.length}):
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-48 pr-1">
            {tickets.length === 0 ? (
              <div className="p-4 text-center text-[11px] font-mono text-surface-500 border border-surface-800/50">
                No active support inquiries. 24/7 dedicated support standing by.
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  className="p-2.5 bg-surface-900 border border-surface-800 rounded flex flex-col gap-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-brand">{t.id}</span>
                    <StatusBadge status={t.severity} />
                  </div>
                  <div className="text-xs font-medium text-white">{t.title}</div>
                  <div className="text-[10px] text-surface-500 font-mono flex justify-between">
                    <span>{t.category}</span>
                    <span>Status: {t.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Team Organization Members Table */}
      <div className="glass-panel p-6 rounded-xl border border-white/10 mb-8">
        <div className="flex justify-between items-center mb-4 border-b border-surface-800 pb-3">
          <div>
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Authorized Engineering Team & Roles
            </h3>
            <p className="text-[10px] font-mono text-surface-400 mt-0.5">
              Role-Based Access Control (RBAC) governing design authority, verification signoff, and CCB approval
            </p>
          </div>
          <span className="text-xs font-mono text-surface-400">
            {members.length} Active Engineers
          </span>
        </div>

        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="p-3 bg-surface-900 border border-surface-800 rounded flex flex-col md:flex-row md:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-surface-800 flex items-center justify-center font-mono text-xs font-bold text-brand border border-surface-700">
                  {m.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                    <span>{m.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-800 text-surface-400 border border-surface-700">
                      {m.role}
                    </span>
                  </div>
                  <div className="text-[11px] text-surface-400">{m.email} &bull; {m.title || 'Technical Specialist'}</div>
                </div>
              </div>

              <div className="text-right text-[10px] font-mono text-surface-500">
                Provisioned: {new Date(m.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Support Ticket Modal */}
      {isTicketModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTicket}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-brand/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Submit Engineering Support & Compliance Inquiry
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Inquiry Title
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Guidance on ARP4754B Stage-Gate evidence mapping"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Category
                </label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Workflow Guidance">Workflow Guidance</option>
                  <option value="Compliance Audit">Compliance Audit</option>
                  <option value="Access">Access / Provisioning</option>
                  <option value="Bug Report">Technical Anomaly</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Severity
                </label>
                <select
                  value={ticketSeverity}
                  onChange={(e) => setTicketSeverity(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Low">Low - Informational</option>
                  <option value="Medium">Medium - Workflow Question</option>
                  <option value="High">High - Impending Review</option>
                  <option value="Critical">Critical - Production Gate Impact</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Detailed Context & Engineering Artifact References
              </label>
              <textarea
                required
                rows={4}
                placeholder="Describe your inquiry, affected requirements, or specific certification audit requirements..."
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setIsTicketModalOpen(false)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={submittingTicket}
                className="px-4 py-1.5 bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold uppercase transition-colors"
              >
                {submittingTicket ? 'TRANSMITTING...' : 'DISPATCH TO FLIGHT SUPPORT'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
