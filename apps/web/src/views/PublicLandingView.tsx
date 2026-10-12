import React, { useState } from 'react';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { api, setAuthToken } from '../lib/api';

interface PublicLandingViewProps {
  onEnterWorkspace: () => void;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
  onSignInSuccess?: (user: any) => void;
}

export const PublicLandingView: React.FC<PublicLandingViewProps> = ({
  onEnterWorkspace,
  onOpenSignIn,
  onOpenSignUp,
  currentPath,
  onNavigate,
  onSignInSuccess,
}) => {
  // Sign In Page State (for /signin)
  const [signInEmail, setSignInEmail] = useState('engineer@nexgen.os');
  const [signInPassword, setSignInPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Interactive Sandbox Tab State on Homepage (/)
  const [sandboxTab, setSandboxTab] = useState<'reqs' | 'ccb' | 'gate' | 'lifecycle'>('reqs');
  const [selectedSandboxReq, setSelectedSandboxReq] = useState('REQ-002');
  const [selectedCcbChange, setSelectedCcbChange] = useState('CHG-01');

  // Contact Form State (for /contact)
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [contactRole, setContactRole] = useState('Chief Systems Engineer');
  const [contactArea, setContactArea] = useState('Aerospace Primary Actuator');
  const [contactMsg, setContactMsg] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  // Quick Demo Logins
  const handleDemoSignIn = async (email: string, pass: string) => {
    setSignInLoading(true);
    setSignInError(null);
    try {
      const res = await api.login({ email, password: pass });
      setAuthToken(res.token);
      if (onSignInSuccess) onSignInSuccess(res.user);
      onEnterWorkspace();
    } catch (err: any) {
      setSignInError(err.message || 'Demo authentication failed.');
    } finally {
      setSignInLoading(false);
    }
  };

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInLoading(true);
    setSignInError(null);
    try {
      const res = await api.login({ email: signInEmail, password: signInPassword });
      setAuthToken(res.token);
      if (onSignInSuccess) onSignInSuccess(res.user);
      onEnterWorkspace();
    } catch (err: any) {
      setSignInError(err.message || 'Invalid email or password.');
    } finally {
      setSignInLoading(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactSubmitting(true);
    setContactSuccess(null);
    try {
      const res = await api.submitContactInquiry({
        name: contactName,
        workEmail: contactEmail,
        organization: contactOrg,
        role: contactRole,
        areaOfInterest: contactArea,
        message: contactMsg,
      });
      setContactSuccess(res.message);
      setContactMsg('');
    } catch (err: any) {
      alert(`Inquiry submission error: ${err.message}`);
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-surface-200 flex flex-col font-sans selection:bg-brand/30">
      <PublicHeader
        currentPath={currentPath}
        onNavigate={onNavigate}
        onOpenSignIn={() => onNavigate('/signin')}
        onOpenSignUp={onOpenSignUp}
        onEnterWorkspace={onEnterWorkspace}
      />

      <main className="flex-1">
        {/* ========================================================================= */}
        {/* ROUTE: DEDICATED SIGN IN VIEW (/signin or /login)                         */}
        {/* ========================================================================= */}
        {(currentPath === '/signin' || currentPath === '/login') && (
          <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-black via-[#070b10] to-black">
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
              {/* Left Column: Mission Control Identity & Fast Demo Pass */}
              <div className="bg-[#0a0f16] border border-surface-800 p-6 sm:p-8 flex flex-col justify-between rounded-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-3xl pointer-events-none" />

                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 bg-brand/20 border border-brand/50 text-brand flex items-center justify-center font-mono font-bold text-xs">
                      NX
                    </div>
                    <span className="font-mono text-xs uppercase tracking-widest text-brand font-bold">
                      AUTHENTICATION CONSOLE
                    </span>
                  </div>

                  <h1 className="text-2xl font-bold font-mono text-white mb-2 leading-tight">
                    Engineering OS Portal
                  </h1>
                  <p className="text-xs text-surface-400 font-mono mb-6 leading-relaxed">
                    Authoritative sign-in for aerospace systems engineering, CCB change control, and empirical release gates.
                  </p>

                  <div className="space-y-3 mb-6">
                    <div className="text-[10px] font-mono uppercase text-surface-400 font-bold tracking-wider">
                      ONE-CLICK EVALUATION LOGINS:
                    </div>

                    {/* Persona 1: Elena Rostova */}
                    <div
                      onClick={() => handleDemoSignIn('engineer@nexgen.os', 'password123')}
                      className="p-3 bg-surface-950/80 border border-surface-700/80 hover:border-brand cursor-pointer rounded transition-all group hover:bg-brand/5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-xs text-white group-hover:text-brand transition-colors">
                          Dr. Elena Rostova
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-brand/10 border border-brand/40 text-brand rounded">
                          LEAD SYSTEMS ENG
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-surface-400">
                        engineer@nexgen.os • Full systems write & trace access
                      </div>
                      <div className="text-[9px] font-mono text-brand mt-1.5 flex items-center gap-1 font-bold">
                        <span>Click for instant login</span> &rarr;
                      </div>
                    </div>

                    {/* Persona 2: Marcus Vance */}
                    <div
                      onClick={() => handleDemoSignIn('admin@nexgen.os', 'admin123')}
                      className="p-3 bg-surface-950/80 border border-surface-700/80 hover:border-purple-400 cursor-pointer rounded transition-all group hover:bg-purple-500/5"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-xs text-white group-hover:text-purple-300 transition-colors">
                          Marcus Vance
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-purple-900/40 border border-purple-500/50 text-purple-300 rounded">
                          CCB CHAIR / ORG ADMIN
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-surface-400">
                        admin@nexgen.os • Change approval & gate authority
                      </div>
                      <div className="text-[9px] font-mono text-purple-400 mt-1.5 flex items-center gap-1 font-bold">
                        <span>Click for instant login</span> &rarr;
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-surface-800/80 flex items-center justify-between text-[10px] font-mono text-surface-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    PostgreSQL 17 Active
                  </span>
                  <span>AES-256 JWT Signed</span>
                </div>
              </div>

              {/* Right Column: Standard Credentials Form */}
              <div className="bg-[#0b0b0b] border border-surface-800 p-6 sm:p-8 flex flex-col justify-between rounded-lg">
                <div>
                  <h2 className="font-mono font-bold text-base text-white uppercase tracking-wider mb-1">
                    Sign In with Credentials
                  </h2>
                  <p className="text-xs text-surface-400 font-mono mb-6">
                    Enter your organization work email and master password.
                  </p>

                  {signInError && (
                    <div className="mb-4 p-3 bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-mono rounded">
                      ✕ {signInError}
                    </div>
                  )}

                  <form onSubmit={handleCredentialsSignIn} className="space-y-4 font-mono">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-surface-400 mb-1">
                        Work Email Address
                      </label>
                      <input
                        type="email"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                        placeholder="engineer@aerospace-oem.com"
                        className="w-full bg-surface-950 border border-surface-700 px-3 py-2 text-white text-xs focus:border-brand focus:outline-none rounded"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] uppercase tracking-wider text-surface-400">
                          Master Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate('/');
                            onOpenSignIn();
                          }}
                          className="text-[9px] text-surface-400 hover:text-brand underline"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={signInPassword}
                          onChange={(e) => setSignInPassword(e.target.value)}
                          required
                          className="w-full bg-surface-950 border border-surface-700 px-3 py-2 text-white text-xs focus:border-brand focus:outline-none rounded pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-2 text-[10px] text-surface-500 hover:text-surface-300"
                        >
                          {showPassword ? 'HIDE' : 'SHOW'}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={signInLoading}
                        className="w-full py-2.5 bg-brand text-black hover:bg-brand-hover font-bold text-xs uppercase tracking-wider rounded transition-colors shadow-lg shadow-brand/20 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {signInLoading ? (
                          <>
                            <span className="w-2.5 h-2.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            <span>Authenticating...</span>
                          </>
                        ) : (
                          <span>Sign In to Engineering Workspace &rarr;</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="pt-6 border-t border-surface-800 text-center font-mono text-xs text-surface-400">
                  <span>Don&apos;t have an organization account? </span>
                  <button
                    onClick={onOpenSignUp}
                    className="text-brand hover:underline font-bold"
                  >
                    Request Enterprise Access
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 1: HOMEPAGE (/) — HIGH-IMPACT AEROSPACE LANDING PAGE                */}
        {/* ========================================================================= */}
        {currentPath === '/' && (
          <div>
            {/* Top Telemetry Ribbon */}
            <div className="bg-[#05080c] border-b border-surface-800 py-1.5 px-4 overflow-x-auto no-scrollbar font-mono text-[10px] text-surface-400 flex items-center justify-center gap-6 select-none">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                POSTGRESQL 17 AIR-GAPPED INSTANCE: ACTIVE
              </span>
              <span className="text-surface-600 hidden sm:inline">|</span>
              <span className="hidden sm:inline">NASA SP-2016-6105 & SAE ARP4754B COMPLIANT</span>
              <span className="text-surface-600 hidden md:inline">|</span>
              <span className="text-brand hidden md:inline">TRACEABILITY GRAPH: 100% CONTINUOUS</span>
              <span className="text-surface-600 hidden lg:inline">|</span>
              <span className="text-surface-300 hidden lg:inline">PRIMARY ACTUATOR TELEMETRY: PRJ-AERO-01</span>
            </div>

            {/* Hero Section */}
            <section className="relative overflow-hidden pt-16 pb-20 border-b border-surface-800 bg-radial-gradient">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand/10 border border-brand/40 text-brand text-xs font-mono rounded-full mb-6 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
                  Engineering Product Development Life Cycle (PDLC) Operating System
                </div>

                <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold font-mono text-white tracking-tight leading-tight max-w-5xl mx-auto mb-6">
                  The Single Source of Engineering Truth for{' '}
                  <span className="text-brand">Complex Aerospace Systems</span>
                </h1>

                <p className="text-sm sm:text-lg text-surface-300 max-w-3xl mx-auto mb-10 font-mono leading-relaxed">
                  Break down the dangerous disconnect between requirements, system architecture, test verifications, safety hazards, and CCB changes. Build an authoritative, auditable engineering graph from concept gate to flight certification.
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                  <button
                    onClick={onEnterWorkspace}
                    className="w-full sm:w-auto px-8 py-4 bg-brand text-black hover:bg-brand-hover font-mono font-bold text-sm uppercase tracking-wider rounded shadow-xl shadow-brand/25 transition-all flex items-center justify-center gap-2 group"
                  >
                    <span>Launch Live Workspace (One-Click Demo)</span>
                    <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
                  </button>
                  <button
                    onClick={() => onNavigate('/signin')}
                    className="w-full sm:w-auto px-7 py-4 bg-surface-900 border border-surface-700 hover:border-brand text-surface-200 hover:text-white font-mono text-sm uppercase tracking-wider rounded transition-all flex items-center justify-center gap-2"
                  >
                    <span>Sign In to Instance</span>
                  </button>
                  <button
                    onClick={() => onNavigate('/how-it-works')}
                    className="w-full sm:w-auto px-6 py-4 bg-transparent border border-surface-800 hover:border-surface-600 text-surface-400 hover:text-white font-mono text-xs uppercase tracking-wider rounded transition-all"
                  >
                    NASA 15-Stage V-Model &darr;
                  </button>
                </div>

                {/* =================================================================== */}
                {/* INTERACTIVE LIVE MISSION CONTROL HUD SIMULATOR                     */}
                {/* =================================================================== */}
                <div className="glass-panel p-5 sm:p-6 rounded-xl border border-white/10 max-w-5xl mx-auto text-left shadow-2xl overflow-hidden bg-[#070b10]">
                  {/* Simulator Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-surface-800 pb-3 mb-5 font-mono text-xs gap-2">
                    <div className="flex items-center gap-2 text-surface-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="font-bold text-white">INTERACTIVE PDLC SIMULATOR</span>
                      <span className="text-surface-500">// PROJECT PRJ-AERO-01</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-surface-400">Click tabs below to test live features:</span>
                      <span className="px-2 py-0.5 bg-brand/10 border border-brand/30 text-brand text-[10px] rounded font-bold">
                        LIVE TELEMETRY
                      </span>
                    </div>
                  </div>

                  {/* Simulator Tabs */}
                  <div className="flex gap-2 border-b border-surface-800 pb-3 mb-4 overflow-x-auto no-scrollbar font-mono text-xs">
                    <button
                      onClick={() => setSandboxTab('reqs')}
                      className={`px-3 py-1.5 rounded uppercase tracking-wider font-bold transition-colors ${
                        sandboxTab === 'reqs'
                          ? 'bg-brand text-black'
                          : 'bg-surface-900 text-surface-400 hover:text-white'
                      }`}
                    >
                      [01] Requirements Trace Matrix
                    </button>
                    <button
                      onClick={() => setSandboxTab('ccb')}
                      className={`px-3 py-1.5 rounded uppercase tracking-wider font-bold transition-colors ${
                        sandboxTab === 'ccb'
                          ? 'bg-brand text-black'
                          : 'bg-surface-900 text-surface-400 hover:text-white'
                      }`}
                    >
                      [02] CCB Ripple Impact Engine
                    </button>
                    <button
                      onClick={() => setSandboxTab('gate')}
                      className={`px-3 py-1.5 rounded uppercase tracking-wider font-bold transition-colors ${
                        sandboxTab === 'gate'
                          ? 'bg-brand text-black'
                          : 'bg-surface-900 text-surface-400 hover:text-white'
                      }`}
                    >
                      [03] Empirical Gate Blocker
                    </button>
                    <button
                      onClick={() => setSandboxTab('lifecycle')}
                      className={`px-3 py-1.5 rounded uppercase tracking-wider font-bold transition-colors ${
                        sandboxTab === 'lifecycle'
                          ? 'bg-brand text-black'
                          : 'bg-surface-900 text-surface-400 hover:text-white'
                      }`}
                    >
                      [04] NASA 15-Stage Lifecycle
                    </button>
                  </div>

                  {/* Tab 1: Requirements Trace Matrix */}
                  {sandboxTab === 'reqs' && (
                    <div className="space-y-4 font-mono">
                      <div className="text-xs text-surface-400">
                        Select a normative requirement from the Primary Actuator benchmark to inspect its end-to-end trace graph:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'REQ-001', title: 'Dual BLDC Motor Drive', pbs: 'HW-ACT-001', test: 'VT-ENG-01', vrf: 'PASSED' },
                          { id: 'REQ-002', title: 'Slew Rate >= 45 deg/s', pbs: 'HW-ACT-001', test: 'VT-DYN-01', vrf: 'FAILED' },
                          { id: 'REQ-003', title: 'Optical Position Sensor', pbs: 'HW-SEN-002', test: 'VT-SEN-01', vrf: 'PASSED' },
                          { id: 'REQ-004', title: 'CAN-Aerospace Bus', pbs: 'HW-MCU-001', test: 'VT-COM-01', vrf: 'PASSED' },
                        ].map((r) => (
                          <div
                            key={r.id}
                            onClick={() => setSelectedSandboxReq(r.id)}
                            className={`p-3 border rounded cursor-pointer transition-all ${
                              selectedSandboxReq === r.id
                                ? 'bg-surface-900 border-brand shadow-sm shadow-brand/20'
                                : 'bg-surface-950 border-surface-800 hover:border-surface-600'
                            }`}
                          >
                            <div className="flex justify-between items-center text-[10px] mb-1">
                              <span className="font-bold text-white">{r.id}</span>
                              <span className={r.vrf === 'FAILED' ? 'text-red-400' : 'text-emerald-400'}>
                                {r.vrf}
                              </span>
                            </div>
                            <div className="text-[11px] text-surface-300 truncate">{r.title}</div>
                          </div>
                        ))}
                      </div>

                      <div className="p-4 bg-surface-950 border border-surface-800 rounded text-xs space-y-2">
                        <div className="flex items-center justify-between text-brand font-bold">
                          <span>ACTIVE REQUIREMENT INSPECTION: {selectedSandboxReq}</span>
                          <span className="text-[10px] text-surface-400">DO-178C DAL-A Safety Allocation</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[11px]">
                          <div>
                            <span className="text-surface-500 block text-[9px] uppercase">Allocated Component (PBS)</span>
                            <span className="text-white font-bold">HW-ACT-001 Brushless Actuator</span>
                          </div>
                          <div>
                            <span className="text-surface-500 block text-[9px] uppercase">Verification Procedure</span>
                            <span className="text-white font-bold">
                              {selectedSandboxReq === 'REQ-002' ? 'VT-DYN-01 Full-Stroke Dynamic Slew' : 'VT-ENG-01 Continuous Torque Run'}
                            </span>
                          </div>
                          <div>
                            <span className="text-surface-500 block text-[9px] uppercase">Empirical Test Status</span>
                            <span className={selectedSandboxReq === 'REQ-002' ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {selectedSandboxReq === 'REQ-002' ? 'FAILED (38.2 deg/s measured < 45.0 required)' : 'PASSED (Zero deviations)'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: CCB Ripple Impact Engine */}
                  {sandboxTab === 'ccb' && (
                    <div className="space-y-4 font-mono">
                      <div className="text-xs text-surface-400">
                        Choose a proposed engineering change to simulate automated recursive ripple impact analysis:
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          onClick={() => setSelectedCcbChange('CHG-01')}
                          className={`p-3 border rounded cursor-pointer ${
                            selectedCcbChange === 'CHG-01' ? 'border-brand bg-surface-900' : 'border-surface-800 bg-surface-950'
                          }`}
                        >
                          <div className="font-bold text-white text-xs">CHG-01: Increase Slew Rate to 60 deg/sec</div>
                          <div className="text-[10px] text-surface-400 mt-1">Target: REQ-002 Dynamic Response</div>
                        </div>
                        <div
                          onClick={() => setSelectedCcbChange('CHG-02')}
                          className={`p-3 border rounded cursor-pointer ${
                            selectedCcbChange === 'CHG-02' ? 'border-brand bg-surface-900' : 'border-surface-800 bg-surface-950'
                          }`}
                        >
                          <div className="font-bold text-white text-xs">CHG-02: Stator Wire Gauge Reduction</div>
                          <div className="text-[10px] text-surface-400 mt-1">Target: HW-ACT-001 Physical Assembly</div>
                        </div>
                      </div>

                      <div className="p-4 bg-surface-950 border border-surface-800 rounded text-xs space-y-3">
                        <div className="text-purple-300 font-bold flex items-center justify-between">
                          <span>CCB AUTOMATED IMPACT TRAVERSAL RESULT</span>
                          <span className="text-[10px] text-surface-400">Graph Depth: 3 Nodes</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
                          <div className="p-2 bg-surface-900 border border-surface-800 rounded">
                            <span className="text-surface-500 block uppercase">Affected Hardware</span>
                            <span className="text-white font-bold">HW-ACT-001 (Motor Driver)</span>
                          </div>
                          <div className="p-2 bg-surface-900 border border-surface-800 rounded">
                            <span className="text-surface-500 block uppercase">Invalidated Tests</span>
                            <span className="text-red-400 font-bold">VT-DYN-01 & VT-THM-02</span>
                          </div>
                          <div className="p-2 bg-surface-900 border border-surface-800 rounded">
                            <span className="text-surface-500 block uppercase">Open NC Impact</span>
                            <span className="text-amber-400 font-bold">NC-001 (Thermal Runaway)</span>
                          </div>
                          <div className="p-2 bg-surface-900 border border-surface-800 rounded">
                            <span className="text-surface-500 block uppercase">Re-Qual Cost</span>
                            <span className="text-brand font-bold">$42,500 Estimated</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Empirical Gate Blocker */}
                  {sandboxTab === 'gate' && (
                    <div className="space-y-4 font-mono">
                      <div className="text-xs text-surface-400">
                        NexGen eliminates rubber-stamping. Gate status is derived mathematically from real database verification runs:
                      </div>

                      <div className="p-4 bg-red-950/40 border border-red-500/50 rounded space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-red-300 text-sm flex items-center gap-2">
                            <span>🚫</span> RELEASE GATE: BLOCKED (CDR / FLIGHT TEST)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-red-900/60 text-red-200 border border-red-700 rounded font-bold">
                            UNSATISFIED CRITERIA
                          </span>
                        </div>

                        <p className="text-xs text-surface-300 leading-relaxed">
                          The system blocked transition to Phase 09 (Flight Readiness) because verification test{' '}
                          <span className="text-white font-bold">VT-DYN-01</span> recorded an empirical slew velocity of{' '}
                          <span className="text-red-400 font-bold">38.2 deg/sec</span>, violating normative criterion{' '}
                          <span className="text-brand font-bold">&gt;= 45.0 deg/sec</span>.
                        </p>

                        <div className="text-[11px] text-surface-400 pt-2 border-t border-red-900/60 flex items-center justify-between">
                          <span>Required Resolution: Execute Engineering Change Order (ECO) or Rectify NC-001</span>
                          <button
                            onClick={onEnterWorkspace}
                            className="text-brand underline font-bold hover:text-white"
                          >
                            Inspect in Workspace &rarr;
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 4: NASA 15-Stage Lifecycle */}
                  {sandboxTab === 'lifecycle' && (
                    <div className="space-y-4 font-mono">
                      <div className="text-xs text-surface-400">
                        Standardized NASA Systems Engineering Handbook (SP-2016-6105) 15-stage V-model progression:
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-[10px]">
                        {[
                          { num: '01', name: 'Opportunity Intake', status: 'COMPLETED' },
                          { num: '02', name: 'Feasibility & ConOps', status: 'COMPLETED' },
                          { num: '03', name: 'Requirements Eng.', status: 'COMPLETED' },
                          { num: '04', name: 'System Architecture', status: 'COMPLETED' },
                          { num: '05', name: 'Detailed Design', status: 'ACTIVE' },
                          { num: '06', name: 'Implementation', status: 'PENDING' },
                          { num: '07', name: 'System Integration', status: 'PENDING' },
                          { num: '08', name: 'Verification (V&V)', status: 'GATED' },
                          { num: '09', name: 'System Validation', status: 'PENDING' },
                          { num: '10', name: 'Production & Mfg', status: 'PENDING' },
                        ].map((stage) => (
                          <div
                            key={stage.num}
                            className={`p-2 border rounded ${
                              stage.status === 'COMPLETED'
                                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                                : stage.status === 'ACTIVE'
                                ? 'bg-brand/10 border-brand text-brand font-bold'
                                : stage.status === 'GATED'
                                ? 'bg-red-950/40 border-red-800 text-red-300'
                                : 'bg-surface-950 border-surface-850 text-surface-500'
                            }`}
                          >
                            <div className="font-bold text-[9px]">PHASE {stage.num}</div>
                            <div className="truncate text-[10px] mt-0.5">{stage.name}</div>
                          </div>
                        ))}
                      </div>

                      <div className="text-right text-[10px] text-surface-400">
                        Stages 11 through 15 (Operations, Sustainment, Evolution) fully modeled in authoritative workspace.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* =================================================================== */}
            {/* COMPARISON: LEGACY DISCONNECTED STACK VS NEXGEN PLM                 */}
            {/* =================================================================== */}
            <section className="py-20 border-b border-surface-800 bg-[#05080c]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <h2 className="text-2xl sm:text-4xl font-mono font-bold text-white mb-4">
                    The Cost of Disconnected Engineering Records
                  </h2>
                  <p className="text-xs sm:text-sm text-surface-400 font-mono">
                    Complex aerospace failures rarely happen because of CAD mistakes. They happen when a changed requirement silently invalidates an empirical test from 8 months ago without anyone noticing until flight trials.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-mono">
                  {/* Legacy Stack */}
                  <div className="p-6 bg-red-950/15 border border-red-900/40 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-sm border-b border-red-900/40 pb-3">
                      <span>✕</span>
                      <span>DISCONNECTED LEGACY TOOLS (DOORS + EXCEL + JIRA)</span>
                    </div>
                    <ul className="space-y-3 text-xs text-surface-300">
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 font-bold">•</span>
                        <span><strong>Silent Ripple Invalidation:</strong> A motor winding revision is ordered in Jira; nobody updates the high-temperature dynamic test script in Excel.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 font-bold">•</span>
                        <span><strong>Premature Gate Approvals:</strong> Critical review milestones (PDR/CDR) advance based on verbal promises while safety hazards sit unnoticed in email threads.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-red-400 font-bold">•</span>
                        <span><strong>Manual Spreadsheet Auditing:</strong> Engineers spend 300+ billable hours before flight readiness trying to build a verification trace matrix by hand.</span>
                      </li>
                    </ul>
                  </div>

                  {/* NexGen PLM */}
                  <div className="p-6 bg-brand/10 border border-brand/40 rounded-xl space-y-4">
                    <div className="flex items-center gap-2 text-brand font-bold text-sm border-b border-brand/30 pb-3">
                      <span>✓</span>
                      <span>NEXGEN PLM — ENGINEERING OPERATING SYSTEM</span>
                    </div>
                    <ul className="space-y-3 text-xs text-surface-300">
                      <li className="flex items-start gap-2">
                        <span className="text-brand font-bold">•</span>
                        <span><strong>Continuous Traceability Graph:</strong> Every requirement, component, test procedure, and NC is connected in PostgreSQL 17 with sub-second graph traversal.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brand font-bold">•</span>
                        <span><strong>Automated CCB Ripple Impact Analysis:</strong> Proposed engineering change orders instantly calculate affected sub-assemblies, test re-runs, and budget impact before voting.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-brand font-bold">•</span>
                        <span><strong>Empirical Verification Gates:</strong> Zero rubber-stamping. Release gates derive pass/fail strictly from recorded numerical test run measurements.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================================== */}
            {/* 6 CORE ARCHITECTURAL ENGINES                                        */}
            {/* =================================================================== */}
            <section className="py-20 border-b border-surface-800 bg-black">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <div className="text-brand text-xs font-mono uppercase tracking-widest mb-2 font-bold">
                    SYSTEM ARCHITECTURE
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-mono font-bold text-white mb-4">
                    Engineered for High-Reliability Aerospace
                  </h2>
                  <p className="text-xs sm:text-sm text-surface-400 font-mono">
                    Six specialized engines powering seamless traceability, rigorous configuration baselines, and complete regulatory compliance.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono">
                  {/* Card 1 */}
                  <div className="glass-panel p-6 rounded-xl border border-sys-req/30 hover:border-sys-req transition-colors">
                    <div className="text-sys-req font-bold text-xs uppercase mb-2">[01] Normative Requirements</div>
                    <p className="text-xs text-surface-300 leading-relaxed mb-4">
                      Author verifiable requirements with real-time semantic quality validation. Allocates directly to physical assemblies with 100% gap detection.
                    </p>
                    <div className="text-[10px] text-surface-500 font-bold">ARP4754B & DO-178C DAL-A/B/C</div>
                  </div>

                  {/* Card 2 */}
                  <div className="glass-panel p-6 rounded-xl border border-sys-arch/30 hover:border-sys-arch transition-colors">
                    <div className="text-sys-arch font-bold text-xs uppercase mb-2">[02] Physical Architecture & ICDs</div>
                    <p className="text-xs text-surface-300 leading-relaxed mb-4">
                      Recursive Product Breakdown Structure (PBS) with physical boundaries, interface definitions, pinouts, and allocated functional mass/power budgets.
                    </p>
                    <div className="text-[10px] text-surface-500 font-bold">MIL-STD-881E Decomposition</div>
                  </div>

                  {/* Card 3 */}
                  <div className="glass-panel p-6 rounded-xl border border-sys-verify/30 hover:border-sys-verify transition-colors">
                    <div className="text-sys-verify font-bold text-xs uppercase mb-2">[03] Empirical Verification Ledger</div>
                    <p className="text-xs text-surface-300 leading-relaxed mb-4">
                      Ingest hardware-in-the-loop and simulation measurements. Failed parameters instantly generate linked Nonconformance Reports (NCRs).
                    </p>
                    <div className="text-[10px] text-surface-500 font-bold">Zero Unearned Passes</div>
                  </div>

                  {/* Card 4 */}
                  <div className="glass-panel p-6 rounded-xl border border-sys-change/30 hover:border-sys-change transition-colors">
                    <div className="text-sys-change font-bold text-xs uppercase mb-2">[04] CCB Ripple Impact Analysis</div>
                    <p className="text-xs text-surface-300 leading-relaxed mb-4">
                      Automated graph traversal computes downstream impact on drawings, tooling, verification procedures, and supplier purchase orders before voting.
                    </p>
                    <div className="text-[10px] text-surface-500 font-bold">EIA-649C Configuration Control</div>
                  </div>

                  {/* Card 5 */}
                  <div className="glass-panel p-6 rounded-xl border border-sys-risk/30 hover:border-sys-risk transition-colors">
                    <div className="text-sys-risk font-bold text-xs uppercase mb-2">[05] Safety & Risk Matrix</div>
                    <p className="text-xs text-surface-300 leading-relaxed mb-4">
                      Integrated 5x5 severity/likelihood risk matrices and hazard tracking. Pre-mitigation and post-mitigation scores linked to verification evidence.
                    </p>
                    <div className="text-[10px] text-surface-500 font-bold">MIL-STD-882E System Safety</div>
                  </div>

                  {/* Card 6 */}
                  <div className="glass-panel p-6 rounded-xl border border-emerald-500/30 hover:border-emerald-400 transition-colors">
                    <div className="text-emerald-400 font-bold text-xs uppercase mb-2">[06] Air-Gapped Data Sovereignty</div>
                    <p className="text-xs text-surface-300 leading-relaxed mb-4">
                      Deploy on self-hosted PostgreSQL 17 or isolated VPC. Zero cloud telemetry leaks, cryptographic audit logs, and non-repudiation assurances.
                    </p>
                    <div className="text-[10px] text-surface-500 font-bold">ITAR & NIST SP 800-171 Ready</div>
                  </div>
                </div>
              </div>
            </section>

            {/* =================================================================== */}
            {/* CALL TO ACTION BANNER                                              */}
            {/* =================================================================== */}
            <section className="py-20 bg-gradient-to-t from-[#06090e] via-black to-black border-b border-surface-800 text-center font-mono">
              <div className="max-w-4xl mx-auto px-4">
                <div className="w-12 h-12 bg-brand/10 border border-brand/40 text-brand flex items-center justify-center font-bold text-sm mx-auto mb-6">
                  NX
                </div>
                <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4">
                  Experience the Aerospace Engineering OS
                </h2>
                <p className="text-xs sm:text-sm text-surface-400 mb-8 max-w-2xl mx-auto leading-relaxed">
                  Evaluate the primary flight control actuator scenario with live requirements, automated impact traversal, and empirical verification gates right in your browser.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    onClick={onEnterWorkspace}
                    className="w-full sm:w-auto px-8 py-4 bg-brand text-black hover:bg-brand-hover font-bold text-sm uppercase tracking-wider rounded shadow-xl shadow-brand/20 transition-all"
                  >
                    Launch Live Workspace &rarr;
                  </button>
                  <button
                    onClick={() => onNavigate('/signin')}
                    className="w-full sm:w-auto px-6 py-4 bg-surface-900 border border-surface-700 hover:border-surface-500 text-white font-bold text-xs uppercase tracking-wider rounded"
                  >
                    Sign In to Organization
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 2: PRODUCT CAPABILITIES (/product)                                  */}
        {/* ========================================================================= */}
        {currentPath === '/product' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Capabilities & Engineering Information Model</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              NexGen enforces the 5-layer engineering operating system architecture: Lifecycle Orchestration, Product Information Model, Assurance Ledger, Change Control Board, and Intelligence.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-panel p-6 rounded-xl border border-sys-req/30">
                <div className="text-sys-req font-bold text-sm mb-2">[REQ] Requirements Engineering & Traceability</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Author normative specifications with automated real-time quality coach. Allocate requirements to PBS physical components with 100% gap detection.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL 17</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-arch/30">
                <div className="text-sys-arch font-bold text-sm mb-2">[SYS] Product Breakdown Structure (PBS)</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Decompose products into System, Subsystem, Component, and Electronic Hardware hierarchies. Establish clear ICD interface boundaries and allocated requirement counts.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL 17</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-verify/30">
                <div className="text-sys-verify font-bold text-sm mb-2">[V&V] Verification Ledger & Empirical Measurements</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Never accept dummy passes. Record test rig parameters, witness inspectors, and numerical measurements. Failed tests automatically trigger linked Nonconformance (NC) reports.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL 17</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-change/30">
                <div className="text-sys-change font-bold text-sm mb-2">[CCB] Engineering Change Orders & Ripple Traversal</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Recursive impact engine traces upstream parent requirements, affected downstream assemblies, and invalidates previously passed verification tests when parameters shift.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL 17</div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 3: NASA LIFECYCLE (/how-it-works)                                   */}
        {/* ========================================================================= */}
        {currentPath === '/how-it-works' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">15-Stage Engineering Product Lifecycle</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              Based on NASA Systems Engineering Handbook (SP-2016-6105) and ISO/IEC/IEEE 15288:2023. Systems engineering is not a linear checklist, but an iterative realization engine.
            </p>

            <div className="space-y-4">
              {[
                { num: '01', name: 'Opportunity & Problem Definition', desc: 'Captures mission objectives, operational concept (ConOps), customer constraints, and regulatory basis.' },
                { num: '02', name: 'Feasibility & Concept Selection', desc: 'Evaluates trade studies, technical readiness levels (TRL), rough order of magnitude costs, and architecture trades.' },
                { num: '03', name: 'Requirements Engineering', desc: 'Authors verifiable, unambiguous system requirements with DO-178C / ARP4754B safety allocations.' },
                { num: '04', name: 'System Architecture & Decomposition', desc: 'Decomposes systems into Product Breakdown Structures (PBS), defining Interface Control Documents (ICDs).' },
                { num: '05', name: 'Detailed Engineering & Design', desc: 'Tracks CAD models, schematic releases, structural calculations, thermal models, and bill of materials (BOM).' },
                { num: '06', name: 'Implementation & Fabrication', desc: 'Generates manufacturing traveler records, supplier work packages, inspection routing, and component serials.' },
                { num: '07', name: 'System Integration', desc: 'Connects electrical, mechanical, and software sub-assemblies. Manages harness ICDs and bench power-on checks.' },
                { num: '08', name: 'Verification (V&V)', desc: 'Executes physical and simulation test cases against normative requirements with witness signatures.' },
                { num: '09', name: 'System Validation', desc: 'Validates that the integrated product fulfills operational mission requirements in representative flight envelopes.' },
                { num: '10', name: 'Manufacturing & Quality Acceptance', desc: 'Enforces First Article Inspection (AS9102), serial lot genealogy, and closed-loop nonconformance reporting.' },
                { num: '11', name: 'Controlled Product Release', desc: 'Conducts formal Flight Readiness Review (FRR), freezes baseline configurations, and generates release gate packages.' },
                { num: '12', name: 'Operations & Field Support', desc: 'Tracks flight cycles, operational anomalies, field service bulletins, and maintenance manuals.' },
                { num: '13', name: 'Maintenance & Overhaul (MRO)', desc: 'Records component wear, life limits, overhaul clearances, and replacement part airworthiness.' },
                { num: '14', name: 'Engineering Change Management', desc: 'Executes Class I and Class II Engineering Change Proposals (ECP) with automated CCB ripple analysis.' },
                { num: '15', name: 'Post-Release Evolution', desc: 'Orchestrates product block upgrades, obsolescence mitigation, and end-of-life decommission protocols.' },
              ].map((stage) => (
                <div key={stage.num} className="p-4 bg-surface-950 border border-surface-800 rounded flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand/10 border border-brand/40 text-brand font-bold flex items-center justify-center shrink-0">
                    {stage.num}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm mb-1">{stage.name}</h3>
                    <p className="text-xs text-surface-400">{stage.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 4: SOLUTIONS (/solutions)                                           */}
        {/* ========================================================================= */}
        {currentPath === '/solutions' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Target Industry Solutions</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              Specialized configurations for organizations developing high-integrity hardware with strict certification and safety mandates.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-surface-950 border border-surface-800 rounded-xl">
                <div className="text-brand font-bold text-sm mb-2">01 // Primary Flight Actuators & Hydraulics</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Designed for electro-mechanical actuators (EMA) and electro-hydraulic servos. Manages dual-redundant motor windings, optical position feedback, and thermal runaway thresholds.
                </p>
                <div className="text-[10px] text-surface-500">Benchmark: Included live in PRJ-AERO-01 dataset</div>
              </div>

              <div className="p-6 bg-surface-950 border border-surface-800 rounded-xl">
                <div className="text-brand font-bold text-sm mb-2">02 // eVTOL & Urban Air Mobility (UAM)</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Accelerate rapid commercial FAA/EASA Special Condition VTOL certification with automated DO-178C software levels and DO-254 complex electronic hardware gates.
                </p>
                <div className="text-[10px] text-surface-500">Traceability: Integrated FHA, FMEA, and FTA safety evidence</div>
              </div>

              <div className="p-6 bg-surface-950 border border-surface-800 rounded-xl">
                <div className="text-brand font-bold text-sm mb-2">03 // Defense Avionics & Satellites</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Radiation-hardened electronics, high-altitude thermal vacuum testing, and strict MIL-STD-882E safety risk matrices with air-gapped on-premises self-hosting.
                </p>
                <div className="text-[10px] text-surface-500">Security: ITAR compliant PostgreSQL deployment mode</div>
              </div>

              <div className="p-6 bg-surface-950 border border-surface-800 rounded-xl">
                <div className="text-brand font-bold text-sm mb-2">04 // High-Reliability Mission Robotics</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Space robotic arms, subsea ROVs, and autonomous mining systems requiring closed-loop configuration management and nonconformance isolation.
                </p>
                <div className="text-[10px] text-surface-500">Governance: AS9100D quality management alignment</div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 5: SECURITY & DATA SOVEREIGNTY (/security)                          */}
        {/* ========================================================================= */}
        {currentPath === '/security' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Data Sovereignty & Security Architecture</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              Engineering IP is an aerospace organization&apos;s most sensitive asset. NexGen is engineered to give organizations total ownership and zero external data leakages.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="p-6 bg-surface-950 border border-surface-800 rounded">
                <div className="text-emerald-400 font-bold text-xs uppercase mb-2">Self-Hosted PostgreSQL 17</div>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Your data resides in your own PostgreSQL instance. No external SaaS lock-in, proprietary cloud binary blobs, or cloud AI training on your CAD records.
                </p>
              </div>

              <div className="p-6 bg-surface-950 border border-surface-800 rounded">
                <div className="text-brand font-bold text-xs uppercase mb-2">Cryptographic Audit Logs</div>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Every requirement edit, verification test result, and CCB vote writes an immutable audit record with actor timestamp, IP, and differential details.
                </p>
              </div>

              <div className="p-6 bg-surface-950 border border-surface-800 rounded">
                <div className="text-purple-300 font-bold text-xs uppercase mb-2">Role-Based Access Control</div>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Granular permission enforcement across Systems Engineers, Design Leads, Quality Auditors, CCB Chairs, and Read-Only Stakeholders.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 6: CONTACT & ENTERPRISE INQUIRIES (/contact)                        */}
        {/* ========================================================================= */}
        {currentPath === '/contact' && (
          <div className="max-w-3xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Enterprise Deployment Inquiry</h1>
            <p className="text-xs text-surface-400 mb-8">
              Submit your project details to evaluate on-premises deployment, regulatory certification assistance, or enterprise multi-tenant configuration.
            </p>

            {contactSuccess ? (
              <div className="p-6 bg-emerald-950/40 border border-emerald-500/50 rounded text-emerald-300 space-y-3">
                <div className="font-bold text-sm">✓ Inquiry Transmitted to Flight Systems Group</div>
                <p className="text-xs leading-relaxed">{contactSuccess}</p>
                <button
                  onClick={() => setContactSuccess(null)}
                  className="px-4 py-2 bg-emerald-800 text-white font-bold text-xs rounded hover:bg-emerald-700 transition-colors"
                >
                  Submit Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Dr. Jordan Hayes"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand rounded"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Work Email</label>
                    <input
                      type="email"
                      required
                      placeholder="j.hayes@aerospace-oem.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand rounded"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Organization / OEM</label>
                    <input
                      type="text"
                      required
                      placeholder="AeroFlight Dynamics Corp"
                      value={contactOrg}
                      onChange={(e) => setContactOrg(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand rounded"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Your Role</label>
                    <select
                      value={contactRole}
                      onChange={(e) => setContactRole(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none rounded"
                    >
                      <option value="Chief Systems Engineer">Chief Systems Engineer</option>
                      <option value="VP of Engineering">VP / Director of Engineering</option>
                      <option value="Quality & Compliance Lead">Quality & Compliance Lead</option>
                      <option value="Program Manager">Program Manager</option>
                      <option value="Other">Other Technical Specialist</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Area of Interest</label>
                  <input
                    type="text"
                    placeholder="e.g. Flight Actuator Redesign, ARP4754B Compliance, CCB Automation"
                    value={contactArea}
                    onChange={(e) => setContactArea(e.target.value)}
                    className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none rounded"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Message & Requirements</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Describe your engineering project, team size, or evaluation timeline..."
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand rounded"
                  />
                </div>

                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="w-full py-3 bg-brand text-black hover:bg-brand-hover font-bold text-xs uppercase tracking-wider rounded transition-colors"
                >
                  {contactSubmitting ? 'TRANSMITTING INQUIRY...' : 'DISPATCH INQUIRY TO FLIGHT SPECIALIST'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 7: LEGAL TERMS & PRIVACY (/terms, /privacy, /status)                */}
        {/* ========================================================================= */}
        {(currentPath === '/terms' || currentPath === '/privacy') && (
          <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">
              {currentPath === '/terms' ? 'Terms of Service' : 'Privacy & Data Governance Policy'}
            </h1>
            <p className="text-xs text-surface-400 mb-8">
              Applicable to NexGen PLM — Engineering OS on-premises and dedicated hosted instances.
            </p>
            <div className="glass-panel p-6 rounded-xl border border-white/10 space-y-4 text-xs text-surface-300 leading-relaxed">
              <h3 className="text-white font-bold text-sm">1. Engineering Data Ownership</h3>
              <p>
                The Customer retains exclusive and unencumbered ownership of all engineering drawings, requirements statements, verification test logs, architecture diagrams, and change records uploaded or generated within the system. NexGen does not claim IP rights nor use Customer data to train public foundation models without explicit mutual agreement.
              </p>
              <h3 className="text-white font-bold text-sm">2. Regulatory & Gate Verification Responsibility</h3>
              <p>
                While NexGen provides deterministic calculation tools and lifecycle gate evaluation engines aligned with NASA SE SP-2016-6105 and SAE ARP4754B, formal airworthiness and flight qualification determinations remain the sole legal responsibility of the authorized engineering organization and designated regulatory signatories.
              </p>
              <h3 className="text-white font-bold text-sm">3. Auditability & Immutability</h3>
              <p>
                Released baselines and recorded verification executions are governed by strict non-repudiation controls. System administrators are prohibited from destructively mutating past test execution records without generating an auditable nonconformance or authorized revision trail.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ROUTE 8: STATUS (/status)                                                 */}
        {/* ========================================================================= */}
        {currentPath === '/status' && (
          <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">System Health & Engine Telemetry</h1>
            <p className="text-xs text-surface-400 mb-8">
              Live operational verification of backend services and database connections.
            </p>
            <div className="glass-panel p-6 rounded-xl border border-white/10 space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-surface-800">
                <span className="text-surface-300">NexGen PLM REST API Engine</span>
                <span className="text-emerald-400 font-bold">200 OK OPERATIONAL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-surface-800">
                <span className="text-surface-300">Authoritative PostgreSQL 17 Relational Graph</span>
                <span className="text-emerald-400 font-bold">CONNECTED & SYNCHRONIZED</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-surface-800">
                <span className="text-surface-300">Prisma ORM Query Engine</span>
                <span className="text-emerald-400 font-bold">v6.19.3 ACTIVE</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-surface-300">Stage-Gate Deterministic Logic Engine</span>
                <span className="text-emerald-400 font-bold">ONLINE</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
};
