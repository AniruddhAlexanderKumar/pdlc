import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface DocumentsViewProps {
  projectId: string;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({ projectId }) => {
  const [docs, setDocs] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Specification');
  const [revision, setRevision] = useState('A');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadDocs = async () => {
    try {
      const data = await api.getDocuments(projectId);
      setDocs(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createDocument({
        projectId,
        title,
        type,
        revision,
        fileName: fileName || `${title.replace(/\s+/g, '_')}_Rev${revision}.pdf`,
      });
      setIsCreateOpen(false);
      setTitle('');
      setFileName('');
      await loadDocs();
    } catch (err: any) {
      alert(`Error creating document: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Documents & Engineering Data"
        subtitle="Version-controlled engineering drawings, specifications, ICDs, and technical reports."
        icon="[DOC]"
        color="text-brand"
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold px-3 py-1.5 transition-colors shadow-lg shadow-brand/10"
          >
            + REGISTER DOCUMENT
          </button>
        }
      />

      <div className="flex-1 glass-panel p-6 rounded-xl overflow-y-auto space-y-3">
        <div className="font-mono text-xs text-brand mb-2 border-b border-surface-800 pb-2">
          Controlled Engineering Documents Repository ({docs.length})
        </div>

        {docs.map((doc) => (
          <div
            key={doc.id}
            className="p-4 bg-surface-900 border border-surface-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-brand/30 transition-colors"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold text-brand">{doc.id}</span>
                <span className="text-[10px] font-mono text-surface-400 border border-surface-700 px-1.5 py-0.5">
                  Rev {doc.revision}
                </span>
                <span className="text-[10px] font-mono text-surface-500 uppercase">{doc.type}</span>
                <StatusBadge status={doc.status} />
              </div>
              <div className="text-sm font-bold text-white">{doc.title}</div>
              <div className="text-xs text-surface-400 font-mono mt-1">
                File: {doc.fileName} ({(doc.fileSize / 1024).toFixed(1)} KB)
              </div>
              <div className="text-[10px] text-surface-500 font-mono mt-0.5">
                Checksum: {doc.checksum} | Author: {doc.authorId}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => alert(`Simulating secure download of authorized file: ${doc.fileName}`)}
                className="px-3 py-1.5 bg-surface-800 text-surface-300 hover:text-white border border-surface-700 font-mono text-xs"
              >
                Download PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-brand/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Register Controlled Engineering Document
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Document Title
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Flight Control Rig ICD"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Document Classification
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Specification">Specification</option>
                  <option value="Drawing">Engineering Drawing</option>
                  <option value="ICD">Interface Control Document</option>
                  <option value="Test Report">Test Report</option>
                  <option value="CAD Model">CAD Reference</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Initial Revision
                </label>
                <input
                  type="text"
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                />
              </div>
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
                className="bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold px-4 py-2"
              >
                {submitting ? 'Registering...' : 'Register Document'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
