import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onUserUpdated: (user: any) => void;
  onLogout: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'team'>('profile');

  // Profile Form
  const [name, setName] = useState(currentUser?.name || '');
  const [title, setTitle] = useState(currentUser?.title || '');
  const [timezone, setTimezone] = useState(currentUser?.timezone || 'UTC');
  const [department, setDepartment] = useState('Systems Engineering Division');

  // Password Change Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification Preferences
  const [notifPrefs, setNotifPrefs] = useState({
    emailAlerts: true,
    changeOrderNotices: true,
    testVerificationFailures: true,
    weeklyRollup: false,
    baselineReleases: true,
    ...(currentUser?.notificationPrefs || {}),
  });

  // Team & Invitations (for OrgAdmin)
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('SystemsEngineer');
  const [inviting, setInviting] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  // States
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setTitle(currentUser.title || '');
      setTimezone(currentUser.timezone || 'UTC');
      if (currentUser.notificationPrefs) {
        setNotifPrefs((prev: any) => ({ ...prev, ...currentUser.notificationPrefs }));
      }
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && activeTab === 'team' && currentUser?.role === 'OrgAdmin') {
      loadInvitations();
    }
  }, [isOpen, activeTab, currentUser]);

  const loadInvitations = async () => {
    try {
      const data = await api.getInvitations();
      setInvitations(data || []);
    } catch (err: any) {
      console.error('Failed to load invitations:', err);
    }
  };

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const updated = await api.updateProfile({
        name,
        title,
        timezone,
        notificationPrefs: notifPrefs,
      });
      onUserUpdated(updated);
      setSuccessMsg('Profile and preferences updated successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      setSaving(false);
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      setSaving(false);
      return;
    }

    try {
      const res = await api.changePassword({
        currentPassword,
        newPassword,
      });
      setSuccessMsg(res.message || 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setGeneratedInviteLink(null);

    try {
      const res = await api.createInvitation({
        email: inviteEmail,
        role: inviteRole,
      });
      setSuccessMsg(`Invitation created for ${inviteEmail}.`);
      setGeneratedInviteLink(res.inviteUrl || `TOKEN: ${res.token}`);
      setInviteEmail('');
      await loadInvitations();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create invitation.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] border border-surface-700 w-full max-w-2xl rounded-none shadow-2xl overflow-hidden font-sans">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-surface-800 bg-[#0e0e0e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand/10 border border-brand/40 text-brand font-mono font-bold flex items-center justify-center text-xs">
              ID
            </div>
            <div>
              <h2 className="font-mono font-bold text-white text-sm uppercase tracking-wider">
                Account & Workspace Preferences
              </h2>
              <p className="text-[10px] font-mono text-surface-400">
                User: {currentUser?.email || 'engineer@nexgen.os'} • Role: {currentUser?.role || 'SystemsEngineer'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-surface-500 hover:text-white font-mono text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-surface-800 bg-[#121212] px-6 text-[11px] font-mono uppercase tracking-wider">
          <button
            onClick={() => { setActiveTab('profile'); setSuccessMsg(null); setErrorMsg(null); }}
            className={`py-3 px-4 border-b-2 font-bold transition-colors ${
              activeTab === 'profile'
                ? 'border-brand text-brand bg-black/30'
                : 'border-transparent text-surface-400 hover:text-white'
            }`}
          >
            Profile
          </button>
          <button
            onClick={() => { setActiveTab('security'); setSuccessMsg(null); setErrorMsg(null); }}
            className={`py-3 px-4 border-b-2 font-bold transition-colors ${
              activeTab === 'security'
                ? 'border-brand text-brand bg-black/30'
                : 'border-transparent text-surface-400 hover:text-white'
            }`}
          >
            Security & Access
          </button>
          <button
            onClick={() => { setActiveTab('notifications'); setSuccessMsg(null); setErrorMsg(null); }}
            className={`py-3 px-4 border-b-2 font-bold transition-colors ${
              activeTab === 'notifications'
                ? 'border-brand text-brand bg-black/30'
                : 'border-transparent text-surface-400 hover:text-white'
            }`}
          >
            Alert Preferences
          </button>
          {currentUser?.role === 'OrgAdmin' && (
            <button
              onClick={() => { setActiveTab('team'); setSuccessMsg(null); setErrorMsg(null); }}
              className={`py-3 px-4 border-b-2 font-bold transition-colors ${
                activeTab === 'team'
                  ? 'border-brand text-brand bg-black/30'
                  : 'border-transparent text-surface-400 hover:text-white'
              }`}
            >
              Team & Invites
            </button>
          )}
        </div>

        {/* Notifications banner */}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 font-mono text-xs">
            ✓ {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-950/40 border border-red-500/50 text-red-300 font-mono text-xs">
            ✕ {errorMsg}
          </div>
        )}

        {/* Tab Body */}
        <div className="p-6">
          {/* TAB 1: Profile */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                    Title / Position
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                    placeholder="e.g. Lead Avionics Architect"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                    Work Email (Locked)
                  </label>
                  <input
                    type="email"
                    value={currentUser?.email || ''}
                    disabled
                    className="w-full bg-surface-950 border border-surface-800 px-3 py-2 text-surface-400 font-mono text-xs cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                    Engineering Department
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                  Primary Timezone (Audit Timestamp Reference)
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                >
                  <option value="UTC">UTC (Universal Coordinated Time)</option>
                  <option value="America/New_York">America/New_York (EST / EDT)</option>
                  <option value="America/Chicago">America/Chicago (CST / CDT)</option>
                  <option value="America/Denver">America/Denver (MST / MDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST / PDT)</option>
                  <option value="Europe/London">Europe/London (GMT / BST)</option>
                  <option value="Europe/Paris">Europe/Paris (CET / CEST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-surface-800 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-brand text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-brand/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Security & Password */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <h3 className="font-mono font-bold text-xs text-white uppercase tracking-wider">
                  Update Master Password
                </h3>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                      New Password (Min 8 chars)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full bg-surface-900 border border-surface-700 px-3 py-2 text-white font-mono text-xs focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-brand/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>

              {/* Session Invalidation & Logout */}
              <div className="pt-6 border-t border-surface-800 flex items-center justify-between">
                <div>
                  <h4 className="font-mono font-bold text-xs text-white uppercase tracking-wider">
                    Current Active Session
                  </h4>
                  <p className="text-[11px] text-surface-500 font-sans mt-0.5">
                    Signed in via JWT with 24-hour expiration token.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-4 py-2 border border-red-500/50 text-red-400 hover:bg-red-500/10 font-mono text-xs uppercase tracking-wider transition-colors"
                >
                  Sign Out & Revoke Session
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Notifications */}
          {activeTab === 'notifications' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <p className="text-xs text-surface-400 font-sans">
                Configure which engineering events send telemetry alerts to your in-app drawer and designated enterprise mailbox.
              </p>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 p-3 bg-surface-900 border border-surface-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifPrefs.changeOrderNotices}
                    onChange={(e) =>
                      setNotifPrefs({ ...notifPrefs, changeOrderNotices: e.target.checked })
                    }
                    className="accent-[#00e5ff] w-4 h-4"
                  />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">
                      CCB & Engineering Change Orders (ECR / ECO)
                    </div>
                    <div className="text-[10px] text-surface-400">
                      Alert whenever an impact assessment is initiated or approval vote is cast.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-surface-900 border border-surface-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifPrefs.testVerificationFailures}
                    onChange={(e) =>
                      setNotifPrefs({ ...notifPrefs, testVerificationFailures: e.target.checked })
                    }
                    className="accent-[#00e5ff] w-4 h-4"
                  />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">
                      Verification Test Executions & Failures
                    </div>
                    <div className="text-[10px] text-surface-400">
                      Notify immediately when physical/simulation verification results deviate from criteria.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-surface-900 border border-surface-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifPrefs.baselineReleases}
                    onChange={(e) =>
                      setNotifPrefs({ ...notifPrefs, baselineReleases: e.target.checked })
                    }
                    className="accent-[#00e5ff] w-4 h-4"
                  />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">
                      Configuration Baselines & Release Milestones
                    </div>
                    <div className="text-[10px] text-surface-400">
                      Notify when CDR, TRR, or Flight Readiness baselines are frozen.
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-surface-900 border border-surface-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifPrefs.emailAlerts}
                    onChange={(e) =>
                      setNotifPrefs({ ...notifPrefs, emailAlerts: e.target.checked })
                    }
                    className="accent-[#00e5ff] w-4 h-4"
                  />
                  <div>
                    <div className="font-mono text-xs text-white font-bold">
                      Dispatch External Email Digests
                    </div>
                    <div className="text-[10px] text-surface-400">
                      Send urgent gate blocking notifications directly to work inbox.
                    </div>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-surface-800 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-brand text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-brand/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Alert Preferences'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: Team & Invitations (OrgAdmin) */}
          {activeTab === 'team' && currentUser?.role === 'OrgAdmin' && (
            <div className="space-y-6">
              {/* Invite Team Member Form */}
              <form onSubmit={handleCreateInvitation} className="p-4 bg-surface-900/60 border border-surface-800 space-y-3">
                <h4 className="font-mono font-bold text-xs text-white uppercase tracking-wider">
                  Invite New Systems Engineer or Stakeholder
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[9px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                      Colleague Work Email
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="engineer@aerospace-oem.com"
                      required
                      className="w-full bg-black border border-surface-700 px-3 py-1.5 text-white font-mono text-xs focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono uppercase tracking-wider text-surface-400 mb-1">
                      Assigned Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-black border border-surface-700 px-2 py-1.5 text-white font-mono text-xs focus:border-brand focus:outline-none"
                    >
                      <option value="SystemsEngineer">Systems Engineer</option>
                      <option value="DesignEngineer">Design Engineer</option>
                      <option value="QualityAuditor">Quality Auditor</option>
                      <option value="OrgAdmin">Org Administrator</option>
                      <option value="Viewer">Read-Only Stakeholder</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={inviting}
                    className="px-3 py-1.5 bg-brand text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-brand/90 disabled:opacity-50"
                  >
                    {inviting ? 'Generating...' : 'Issue Secure Invitation'}
                  </button>
                </div>

                {generatedInviteLink && (
                  <div className="mt-3 p-2 bg-brand/10 border border-brand/40 text-brand font-mono text-[10px] break-all select-all">
                    Invitation Token / URL: {generatedInviteLink}
                  </div>
                )}
              </form>

              {/* Outstanding Invitations List */}
              <div>
                <h4 className="font-mono font-bold text-xs text-white uppercase tracking-wider mb-2">
                  Pending Organization Invitations ({invitations.length})
                </h4>
                {invitations.length === 0 ? (
                  <div className="text-surface-500 font-mono text-xs p-4 border border-surface-850 text-center">
                    No active pending invitations.
                  </div>
                ) : (
                  <div className="border border-surface-800 divide-y divide-surface-800 max-h-48 overflow-y-auto">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="p-3 flex items-center justify-between text-xs font-mono">
                        <div>
                          <div className="text-white font-bold">{inv.email}</div>
                          <div className="text-surface-400 text-[10px]">
                            Role: {inv.role} • Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[9px] uppercase font-bold rounded ${
                            inv.status === 'Accepted'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-surface-800 bg-[#0e0e0e] flex items-center justify-between text-[10px] font-mono text-surface-500">
          <span>Enterprise Tenant: NexGen Aerospace OS</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-surface-800 hover:bg-surface-700 text-white font-mono text-xs uppercase"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
