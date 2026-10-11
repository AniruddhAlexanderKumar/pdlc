import React, { useState } from 'react';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { api } from '../lib/api';

interface PublicLandingViewProps {
  onEnterWorkspace: () => void;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const PublicLandingView: React.FC<PublicLandingViewProps> = ({
  onEnterWorkspace,
  onOpenSignIn,
  onOpenSignUp,
  currentPath,
  onNavigate,
}) => {
  // Contact Form State (for /contact)
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactOrg, setContactOrg] = useState('');
  const [contactRole, setContactRole] = useState('Chief Systems Engineer');
  const [contactArea, setContactArea] = useState('Aerospace Primary Actuator');
  const [contactMsg, setContactMsg] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

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
        onOpenSignIn={onOpenSignIn}
        onOpenSignUp={onOpenSignUp}
      />

      <main className="flex-1">
        {/* Route 1: Homepage (/) */}
        {currentPath === '/' && (
          <div>
            {/* Hero Section */}
            <section className="relative overflow-hidden pt-20 pb-24 border-b border-surface-800">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand/10 border border-brand/30 text-brand text-xs font-mono rounded-full mb-6 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-brand animate-ping"></span>
                  NASA Systems Engineering &bull; ISO 15288 &bull; ARP4754B Compliant
                </div>

                <h1 className="text-4xl sm:text-6xl font-bold font-mono text-white tracking-tight leading-tight max-w-4xl mx-auto mb-6">
                  The Engineering Product Development <span className="text-brand">Operating System</span>
                </h1>

                <p className="text-base sm:text-lg text-surface-400 max-w-2xl mx-auto mb-8 font-mono leading-relaxed">
                  Connect requirements, architecture decomposition, empirical verification, safety risks, and change control into a single auditable graph. Stop relying on disconnected spreadsheets and blind assumptions.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                  <button
                    onClick={onEnterWorkspace}
                    className="w-full sm:w-auto px-8 py-3.5 bg-brand text-black hover:bg-brand-hover font-mono font-bold text-sm uppercase tracking-wider rounded shadow-lg shadow-brand/25 transition-all"
                  >
                    Enter Live Engineering Workspace &rarr;
                  </button>
                  <button
                    onClick={() => onNavigate('/how-it-works')}
                    className="w-full sm:w-auto px-6 py-3.5 bg-surface-900 border border-surface-700 text-surface-200 hover:text-white font-mono text-sm uppercase tracking-wider rounded transition-all"
                  >
                    Explore 15-Stage Lifecycle
                  </button>
                </div>

                {/* Simulated Mission Control HUD Teaser */}
                <div className="glass-panel p-4 rounded-xl border border-white/10 max-w-5xl mx-auto text-left shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between border-b border-surface-800 pb-2 mb-4 font-mono text-xs">
                    <div className="flex items-center gap-2 text-surface-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>PROJECT PRJ-AERO-01 // FLIGHT CONTROL ACTUATOR LRU</span>
                    </div>
                    <span className="text-brand">[POSTGRESQL 17 AUTHORITATIVE GRAPH]</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                    <div className="p-3 bg-surface-950 border border-surface-800 rounded">
                      <div className="text-[10px] text-surface-500 uppercase">PBS Allocation</div>
                      <div className="text-2xl font-bold text-sys-req mt-1">100%</div>
                      <div className="text-[9px] text-surface-400 mt-0.5">4 of 4 Reqs Linked</div>
                    </div>
                    <div className="p-3 bg-surface-950 border border-surface-800 rounded">
                      <div className="text-[10px] text-surface-500 uppercase">Verification Health</div>
                      <div className="text-2xl font-bold text-red-400 mt-1">1 FAIL</div>
                      <div className="text-[9px] text-surface-400 mt-0.5">VRF-002 Transit Time</div>
                    </div>
                    <div className="p-3 bg-surface-950 border border-surface-800 rounded">
                      <div className="text-[10px] text-surface-500 uppercase">Change Impact (CCB)</div>
                      <div className="text-2xl font-bold text-sys-change mt-1">RIPPLE</div>
                      <div className="text-[9px] text-surface-400 mt-0.5">Automated Traversal</div>
                    </div>
                    <div className="p-3 bg-surface-950 border border-surface-800 rounded">
                      <div className="text-[10px] text-surface-500 uppercase">Release Gate</div>
                      <div className="text-2xl font-bold text-sys-release mt-1">BLOCKED</div>
                      <div className="text-[9px] text-surface-400 mt-0.5">Mandatory Criteria</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Why Disconnected Records Kill Aerospace Programs */}
            <section className="py-20 border-b border-surface-800 bg-surface-950/60">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16">
                  <h2 className="text-2xl sm:text-3xl font-mono font-bold text-white mb-4">
                    The Cost of Disconnected Engineering Records
                  </h2>
                  <p className="text-xs sm:text-sm text-surface-400 font-mono">
                    Aerospace hardware failures rarely stem from CAD errors. They happen when a changed requirement invalidates a past test without anyone realizing it until flight qualification.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 font-mono">
                  <div className="glass-panel p-6 rounded-xl border border-white/5">
                    <div className="text-red-400 font-bold text-sm mb-2">[01] Blind Change Ripple</div>
                    <p className="text-xs text-surface-400 leading-relaxed">
                      An engineer modifies stator coil gauge to reduce mass. Without graph impact analysis, nobody knows this invalidates the high-temperature dynamic load test performed 6 months prior.
                    </p>
                  </div>
                  <div className="glass-panel p-6 rounded-xl border border-white/5">
                    <div className="text-amber-400 font-bold text-sm mb-2">[02] Premature Release Gates</div>
                    <p className="text-xs text-surface-400 leading-relaxed">
                      Design reviews (PDR/CDR) proceed based on verbal assurances while open nonconformances and critical thermal risks remain unresolved in offline spreadsheets.
                    </p>
                  </div>
                  <div className="glass-panel p-6 rounded-xl border border-white/5">
                    <div className="text-brand font-bold text-sm mb-2">[03] Unverifiable Requirements</div>
                    <p className="text-xs text-surface-400 leading-relaxed">
                      Subjective phrasing like "the motor shall be sufficiently fast" passes into production without allocated hardware limits or empirical pass/fail acceptance tolerances.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Route 2: Product Capabilities (/product) */}
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
                  Author normative specifications with automated real-time quality coach (preventing ambiguous goals like "fast" or "lightweight"). Allocate requirements to PBS physical components with 100% gap detection.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-arch/30">
                <div className="text-sys-arch font-bold text-sm mb-2">[SYS] Product Breakdown Structure (PBS)</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Decompose products into System, Subsystem, Component, and Electronic Hardware hierarchies. Establish clear ICD interface boundaries and allocated requirement counts.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-verify/30">
                <div className="text-sys-verify font-bold text-sm mb-2">[V&V] Verification Ledger & Empirical Measurements</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Never accept dummy passes. Record test rig parameters, witness inspectors, and numerical measurements. Failed tests automatically trigger linked Nonconformance (NC) reports.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-change/30">
                <div className="text-sys-change font-bold text-sm mb-2">[CCB] Ripple-Effect Change Impact Analysis</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Graph traversal identifies downstream architecture impacts, invalidated verification procedures requiring retest, and reopened safety risks before ECO authorization.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-purple-500/30">
                <div className="text-purple-400 font-bold text-sm mb-2">[BSL] Configuration Baselines & Field Diffs</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Immutable freeze-frames capturing complete requirement, architecture, and verification state. Run automated field-level diffs between baseline snapshots.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL</div>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-sys-release/30">
                <div className="text-sys-release font-bold text-sm mb-2">[REL] Deterministic Lifecycle Release Gate</div>
                <p className="text-xs text-surface-300 leading-relaxed mb-4">
                  Automated gatekeeper evaluates physical database rows. Blocks release if failed tests exist, requirements remain unallocated, or high risks lack mitigation.
                </p>
                <div className="text-[10px] text-surface-500">Status: Fully Verified & Operational in PostgreSQL</div>
              </div>
            </div>
          </div>
        )}

        {/* Route 3: How It Works (/how-it-works) */}
        {currentPath === '/how-it-works' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">15-Stage Product Development Lifecycle</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              Aligned with NASA Systems Engineering Handbook (SP-2016-6105 Rev 2), ISO/IEC/IEEE 15288:2023, and SAE ARP4754B.
            </p>

            <div className="space-y-4">
              {[
                { stage: '01', name: 'Opportunity & Problem Definition', desc: 'Capture customer need, problem statement, and justification without forcing premature specs.' },
                { stage: '02', name: 'Feasibility & Concept Selection', desc: 'Score alternatives against physical constraints and establish preliminary technical budgets.' },
                { stage: '03', name: 'Stakeholder Needs Definition', desc: 'Translate operational scenarios and user constraints into formal engineering expectations.' },
                { stage: '04', name: 'System Requirements Engineering', desc: 'Define normative "shall" statements with verified numerical limits and allocation mapping.' },
                { stage: '05', name: 'System Architecture & PBS Decomposition', desc: 'Decompose line-replaceable units (LRUs) into mechanical, electrical, and firmware elements.' },
                { stage: '06', name: 'Detailed Design (Active Stage in Demo)', desc: 'Generate 3D CAD, schematics, ICD pinouts, and controlled engineering specifications.' },
                { stage: '07', name: 'Design Reviews (PDR / CDR)', desc: 'Conduct formal gateway reviews. Unresolved findings strictly block stage exit.' },
                { stage: '08', name: 'Implementation & Procurement', desc: 'Manufacture parts, wind stator coils, inspect supplier lot conformance.' },
                { stage: '09', name: 'Integration & Interface Check', desc: 'Assemble actuator subsystems and verify interface control document (ICD) continuity.' },
                { stage: '10', name: 'Verification Testing', desc: 'Empirical execution of test procedures. Measure transit speed, torque, thermal dissipation.' },
                { stage: '11', name: 'System Validation', desc: 'Prove the integrated product fulfills customer operational mission in flight conditions.' },
                { stage: '12', name: 'Regulatory Certification & Safety Signoff', desc: 'Assemble compliance evidence package for FAA / EASA / customer review authority.' },
                { stage: '13', name: 'Release to Production', desc: 'Freeze released configuration manifest and establish serial number tracking.' },
                { stage: '14', name: 'Operations & Maintenance', desc: 'Log field feedback, component reliability metrics, and overhaul procedures.' },
                { stage: '15', name: 'Change & Retirement', desc: 'Manage controlled obsolescence, supersession, and safe fleet retirement.' },
              ].map((s) => (
                <div key={s.stage} className="p-4 bg-surface-950 border border-surface-800 rounded-lg flex items-start gap-4">
                  <div className="w-10 h-10 rounded bg-brand/10 border border-brand/30 flex items-center justify-center font-bold text-brand shrink-0">
                    {s.stage}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">{s.name}</h3>
                    <p className="text-xs text-surface-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Route 4: Solutions (/solutions) */}
        {currentPath === '/solutions' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Domain Solutions</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              Engineered specifically for aerospace, defense, eVTOL, robotics, and safety-critical electromechanical hardware.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass-panel p-6 rounded-xl border border-white/10">
                <h3 className="text-sm font-bold text-brand mb-2">Flight Surface Actuators & Avionics</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Manage primary aileron, rudder, and elevator fly-by-wire servo actuators. Maintain traceability across high-bandwidth motor control firmware (DO-178C), inverter PCBAs (DO-254), and planetary gear trains.
                </p>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-white/10">
                <h3 className="text-sm font-bold text-brand mb-2">eVTOL & Electric Propulsion Systems</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Track severe mass-reduction programs against battery thermal runaway risks and inverter efficiency requirements. Ripple impact analysis prevents blind component substitutions.
                </p>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-white/10">
                <h3 className="text-sm font-bold text-brand mb-2">Defense & Space Payloads</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Air-gapped deployment ready. Complete local data ownership in self-controlled PostgreSQL ensures no ITAR or EAR technical drawings are exported to third-party multi-tenant clouds.
                </p>
              </div>

              <div className="glass-panel p-6 rounded-xl border border-white/10">
                <h3 className="text-sm font-bold text-brand mb-2">Safety-Critical Medical Robotics</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Automate ISO 13485 and ISO 14971 risk management. Correlate hazard analyses directly to nonconformances and verified design mitigations.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Route 5: Security & Data Governance (/security) */}
        {currentPath === '/security' && (
          <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Security & Data Sovereignty</h1>
            <p className="text-xs text-surface-400 mb-12 max-w-3xl">
              Aerospace technical data is high-value IP. NexGen PLM gives engineering organizations sovereign control over every byte.
            </p>

            <div className="space-y-6">
              <div className="p-6 bg-surface-950 border border-emerald-500/30 rounded-xl">
                <h3 className="text-sm font-bold text-emerald-400 mb-2">&check; Self-Controlled PostgreSQL 17 Infrastructure</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Zero reliance on third-party backend-as-a-service platforms (Supabase, Firebase, or external cloud vector stores). Core engineering records, requirements, test logs, and drawing checksums reside solely in operator-controlled infrastructure.
                </p>
              </div>

              <div className="p-6 bg-surface-950 border border-white/10 rounded-xl">
                <h3 className="text-sm font-bold text-white mb-2">&check; Role-Based Access Control (RBAC) & Separation of Duties</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Administrative users cannot unilaterally approve engineering gate releases or waive verification test failures without authorized engineering roles (SystemsEngineer, QualityEngineer, ChiefEngineer).
                </p>
              </div>

              <div className="p-6 bg-surface-950 border border-white/10 rounded-xl">
                <h3 className="text-sm font-bold text-white mb-2">&check; Immutable SHA-256 Checksumming & Audit Logs</h3>
                <p className="text-xs text-surface-300 leading-relaxed">
                  Every uploaded specification, ICD, and drawing is recorded with SHA-256 integrity checksums. Every requirement status update, baseline freeze, and CCB decision generates an immutable row in the PostgreSQL AuditEvent ledger.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Route 6: Contact & Sales Inquiries (/contact) */}
        {currentPath === '/contact' && (
          <div className="max-w-3xl mx-auto px-4 py-16 sm:px-6 lg:px-8 font-mono">
            <h1 className="text-3xl font-bold text-white mb-3">Contact & Evaluation Access</h1>
            <p className="text-xs text-surface-400 mb-8">
              Submit your engineering organization details to evaluate the NexGen PLM operating system or request on-premises deployment guidance.
            </p>

            {contactSuccess ? (
              <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center space-y-3">
                <div className="text-emerald-400 font-bold text-base">&check; Inquiry Successfully Dispatched!</div>
                <p className="text-xs text-surface-300">{contactSuccess}</p>
                <button
                  onClick={() => setContactSuccess(null)}
                  className="px-4 py-1.5 bg-surface-900 border border-surface-700 text-xs text-white"
                >
                  Submit Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="glass-panel p-6 rounded-xl border border-white/10 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Your Full Name</label>
                    <input
                      required
                      type="text"
                      placeholder="Dr. Jordan Vance"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Work Email</label>
                    <input
                      required
                      type="email"
                      placeholder="j.vance@aerospace-systems.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Engineering Organization</label>
                    <input
                      required
                      type="text"
                      placeholder="Orbital Propulsion Corp"
                      value={contactOrg}
                      onChange={(e) => setContactOrg(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-surface-400 tracking-widest block mb-1">Your Role</label>
                    <select
                      value={contactRole}
                      onChange={(e) => setContactRole(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none"
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
                    className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none"
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
                    className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
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

        {/* Route 7: Legal Terms & Privacy (/terms, /privacy, /status) */}
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

        {/* Route 8: Status (/status) */}
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
