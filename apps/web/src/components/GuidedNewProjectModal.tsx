import React, { useState } from 'react';
import { api } from '../lib/api';

interface GuidedNewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (newProjectId: string) => void;
}

export const GuidedNewProjectModal: React.FC<GuidedNewProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [problemSummary, setProblemSummary] = useState('');
  const [projectCategory, setProjectCategory] = useState('Aerospace Subsystem');
  const [templateType, setTemplateType] = useState('guided');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      // 1. Generate unique project ID
      const randomSuffix = Math.floor(10 + Math.random() * 90);
      const generatedId = `PRJ-${projectCategory.slice(0, 4).toUpperCase()}-${randomSuffix}`;

      // 2. Persist opportunity record first (Step 1 of SE Lifecycle: Problem Statement)
      const opp = await api.createOpportunity({
        title: `${projectName} Development & Validation`,
        problem: problemSummary || 'Initial engineering requirement definition and performance optimization.',
        justification: `Approved opportunity for ${projectCategory} development initiative.`,
      });

      // 3. Convert opportunity to formal project
      await api.approveOpportunity(opp.id);
      const project = await api.convertToProject(opp.id, {
        projectId: generatedId,
        projectName: projectName,
        description: problemSummary,
      });

      onProjectCreated(project.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create project. Please verify inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-xl bg-surface-900 border border-brand/40 rounded-xl p-6 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-surface-800 pb-3 mb-4">
          <div>
            <span className="text-[10px] font-mono font-bold text-brand uppercase tracking-wider block">
              Step {step} of 4 // Guided Project Setup Wizard
            </span>
            <h3 className="text-base font-mono font-bold text-white uppercase tracking-wider">
              {step === 1 && 'What are you building?'}
              {step === 2 && 'What problem does this product solve?'}
              {step === 3 && 'Choose your starting setup template'}
              {step === 4 && 'Confirm & Launch Engineering Workspace'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white font-mono text-sm px-2 py-1"
          >
            [ESC]
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs rounded">
            ! {errorMsg}
          </div>
        )}

        {/* Step 1: Basic Identity */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-surface-300">
              Give your product or project an identifiable name. You do not need formal aerospace jargon to get started.
            </p>
            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Product Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. NextGen Drone Flight Actuator, Solar Battery Inverter, Cryogenic Valve"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 font-mono focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Product Category
              </label>
              <select
                value={projectCategory}
                onChange={(e) => setProjectCategory(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 font-mono focus:outline-none"
              >
                <option value="Aerospace Subsystem">Aerospace Subsystem / Flight Critical</option>
                <option value="Electromechanical">Electromechanical Device / Actuator</option>
                <option value="Power Electronic">Power Electronic / Inverter PCBA</option>
                <option value="Composite Structure">Composite Structural Component</option>
                <option value="Embedded Software">Embedded Firmware / Control Software</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 2: Problem Definition */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-surface-300">
              In plain language, explain what goal or problem this engineering development will address.
            </p>
            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Problem or Improvement Objective
              </label>
              <textarea
                rows={4}
                required
                placeholder="e.g. The current unit exceeds our 2.5kg mass allocation and cannot achieve 0.8s response time under load. This redesign targets 2.1kg and high-frequency servo authority."
                value={problemSummary}
                onChange={(e) => setProblemSummary(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 font-mono focus:outline-none focus:border-brand"
              />
            </div>
            <div className="p-3 bg-surface-800/60 border border-surface-700 text-[11px] text-surface-300 rounded">
              <span className="text-brand font-bold">Why this matters: </span>
              In systems engineering, every technical requirement and test must trace back to a validated customer problem.
            </div>
          </div>
        )}

        {/* Step 3: Organization & Template */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-surface-300">
              Select how much structure you want initially. All templates enforce full traceability when you are ready.
            </p>
            <div
              onClick={() => setTemplateType('guided')}
              className={`p-3 rounded border cursor-pointer transition-colors ${
                templateType === 'guided'
                  ? 'bg-brand/10 border-brand text-white'
                  : 'bg-surface-950 border-surface-800 text-surface-400 hover:border-surface-700'
              }`}
            >
              <div className="text-xs font-mono font-bold flex items-center justify-between">
                <span>Guided Project (Recommended for Beginners)</span>
                {templateType === 'guided' && <span className="text-brand">[SELECTED]</span>}
              </div>
              <p className="text-[11px] text-surface-300 mt-1">
                Includes plain-language prompts, step-by-step next actions, and automated requirement suggestions.
              </p>
            </div>

            <div
              onClick={() => setTemplateType('aerospace')}
              className={`p-3 rounded border cursor-pointer transition-colors ${
                templateType === 'aerospace'
                  ? 'bg-brand/10 border-brand text-white'
                  : 'bg-surface-950 border-surface-800 text-surface-400 hover:border-surface-700'
              }`}
            >
              <div className="text-xs font-mono font-bold flex items-center justify-between">
                <span>Formal Systems Engineering (NASA SE / ARP4754B)</span>
                {templateType === 'aerospace' && <span className="text-brand">[SELECTED]</span>}
              </div>
              <p className="text-[11px] text-surface-300 mt-1">
                Full PDR/CDR lifecycle gates, formal allocation matrices, baseline snapshots, and CCB approval workflows.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Summary & Launch */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-xs text-surface-300">
              Ready to launch your workspace. The system will create your permanent engineering ledger in PostgreSQL.
            </p>
            <div className="p-3 bg-surface-950 border border-surface-800 text-xs font-mono space-y-2 rounded">
              <div className="flex justify-between">
                <span className="text-surface-400">Product Name:</span>
                <span className="text-white font-bold">{projectName || 'Unnamed Project'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-400">Category:</span>
                <span className="text-white">{projectCategory}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-400">Template:</span>
                <span className="text-brand">{templateType.toUpperCase()}</span>
              </div>
              <div className="pt-2 border-t border-surface-800 text-surface-300 text-[11px]">
                <span className="text-emerald-400 font-bold">&check; </span>
                Automatic opportunity record OPP-xxx will be registered and approved.
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex justify-between items-center mt-6 pt-3 border-t border-surface-800">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
            >
              &larr; BACK
            </button>
          ) : (
            <div></div>
          )}

          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 && !projectName.trim()}
              onClick={() => setStep((s) => s + 1)}
              className="px-4 py-1.5 bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold uppercase transition-colors disabled:opacity-40"
            >
              CONTINUE &rarr;
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleCreate}
              className="px-4 py-1.5 bg-emerald-500 text-black hover:bg-emerald-400 text-xs font-mono font-bold uppercase transition-colors"
            >
              {submitting ? 'INITIALIZING WORKSPACE...' : 'CREATE & OPEN PROJECT'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
