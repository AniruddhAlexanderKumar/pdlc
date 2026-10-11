import React, { useState } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { api } from '../lib/api';

interface ArchitectureViewProps {
  architecture: any[];
  requirements: any[];
  projectId: string;
  onRefresh: () => void;
  onNavigateToReqs: (reqId?: string) => void;
}

export const ArchitectureView: React.FC<ArchitectureViewProps> = ({
  architecture,
  requirements,
  projectId,
  onRefresh,
  onNavigateToReqs,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('Component');
  const [parentId, setParentId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createArchitecture({
        projectId,
        name,
        description,
        type,
        parentId: parentId || null,
      });
      setIsCreateOpen(false);
      setName('');
      setDescription('');
      onRefresh();
    } catch (err: any) {
      alert(`Error creating architecture element: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Product Breakdown Structure (PBS)"
        subtitle="Hierarchical system architecture decomposition and allocated requirement mapping."
        icon="[SYS]"
        color="text-sys-arch"
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-sys-arch hover:bg-blue-600 text-white text-xs font-mono font-bold px-3 py-1.5 transition-colors"
          >
            + ADD PBS ELEMENT
          </button>
        }
      />

      <div className="flex-1 glass-panel p-6 rounded-xl overflow-y-auto">
        <div className="font-mono text-xs text-sys-arch mb-4 border-b border-white/10 pb-2 flex justify-between">
          <span>Aircraft Subsystem Level // Assembly Decomposition</span>
          <span className="text-surface-400">{architecture.length} Elements Defined</span>
        </div>

        <div className="pl-4 space-y-3 relative">
          <div className="tree-line"></div>
          {architecture.map((node) => {
            const allocated = requirements.filter((r) => r.allocatedTo === node.id);
            return (
              <div
                key={node.id}
                className="bg-surface-800/80 border border-white/5 p-4 rounded flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 transition-colors hover:border-sys-arch/40"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sys-arch font-mono text-base font-bold">
                      {node.type === 'System' ? '[SYS]' : '[CMP]'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{node.id}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-900 text-surface-400 border border-surface-700 font-mono">
                          {node.type}
                        </span>
                        {node.parentId && (
                          <span className="text-[10px] text-surface-500 font-mono">
                            child of {node.parentId}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium mt-1 text-surface-200">{node.name}</div>
                      {node.description && (
                        <div className="text-xs text-surface-400 mt-0.5">{node.description}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] text-surface-400 uppercase tracking-widest mb-1 font-mono">
                    Allocated Reqs
                  </div>
                  <div
                    onClick={() => onNavigateToReqs()}
                    className="font-mono text-lg font-bold text-sys-req cursor-pointer hover:underline"
                  >
                    {allocated.length}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create PBS Element Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-surface-700 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              + Add Product Breakdown Element
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Element Name
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Stator Housing Assembly"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Element Classification
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="System">System</option>
                  <option value="Subsystem">Subsystem</option>
                  <option value="Component">Component</option>
                  <option value="Electronic Hardware">Electronic Hardware</option>
                  <option value="Software">Software</option>
                  <option value="Assembly">Assembly</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Parent System / Component
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="">-- Top Level (No Parent) --</option>
                  {architecture.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Description / Technical Scope
              </label>
              <input
                type="text"
                placeholder="Functional scope or drawing reference..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-sys-arch hover:bg-blue-600 text-white text-xs font-mono font-bold px-4 py-1.5"
              >
                {submitting ? 'Creating...' : 'Create PBS Element'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
