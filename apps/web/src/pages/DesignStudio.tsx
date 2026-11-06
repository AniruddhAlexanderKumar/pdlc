import React from 'react';
import { LayoutGrid, Menu, Palette, Settings, Trash, ZoomIn, ZoomOut } from 'lucide-react';

export function DesignStudioPage() {
  const [tools, setTools] = React.useState<'create' | 'modify' | 'inspect' | 'view'>('view');
  const [gridSize, setGridSize] = React.useState<'none' | '24' | '48' | '72'>('24');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* Fusion 360-style top toolbar */}
      <div className="border-b border-indigo-200 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-indigo-800">Design Studio</h1>
            <LayoutGrid className="h-6 w-6 text-indigo-400" />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              View
            </button>
            <button className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              Zoom In
              <ZoomIn className="h-3.5 w-3.5 ml-1" />
            </button>
            <button className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              Zoom Out
              <ZoomOut className="h-3.5 w-3.5 ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Left tool panel (Fusion 360-style) */}
      <div className="fixed left-0 top-20 h-screen w-20 bg-white border-r border-indigo-200 flex flex-col">
        <button className="flex-1 rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors active:bg-indigo-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white" onClick={() => setTools('create')}>
          <svg className="h-4 w-4 margin-right-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 4" /></svg>
          Create
        </button>
        <button className="flex-1 rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors active:bg-indigo-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white" onClick={() => setTools('modify')}>
          <svg className="h-4 w-4 margin-right-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18M3 8h9l-1 4" /></svg>
          Modify
        </button>
        <button className="flex-1 rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors active:bg-indigo-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white" onClick={() => setTools('inspect')}>
          <svg className="h-4 w-4 margin-right-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v6h4v-6H9zm6-8v4h12V9h-12zm-9 8h6v4H3v-4z" /></svg>
          Inspect
        </button>
        <button className="flex-1 rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors active:bg-indigo-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-white" onClick={() => setTools('view')}>
          <svg className="h-4 w-4 margin-right-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          View
        </button>
      </div>

      {/* Main canvas area */}
      <div className="ml-20 flex flex-col flex-1 overflow-hidden">
        {/* Top property panel */}
        <div className="border-b border-indigo-200 bg-white py-4 px-6 flex items-center justify-between">
          <span className="text-sm text-zinc-500">Grid</span>
          <select
            onChange={(e) => setGridSize(e.target.value as 'none' | '24' | '48' | '72')}
            className="ml-2 rounded border border-zinc-300 px-2 py-1 text-sm shadow-sm"
          >
            <option value="none">None</option>
            <option value="24">24px</option>
            <option value="48">48px</option>
            <option value="72">72px</option>
          </select>
        </div>

        {/* Canvas area */}
        <div className="flex-1 min-h-[600px] flex items-center justify-center bg-gray-100">
          <div className="relative w-full max-w-2xl max-h-[600px] bg-white rounded-lg shadow-xl">
            <div className="absolute inset-1 bg-indigo-100 opacity-30 rounded-lg" />
            <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
              <h2 className="text-2xl font-medium text-indigo-600 mb-4">Design Canvas</h2>
              <p className="text-zinc-400 mb-8">
                Your Fusion 360-inspired design workspace. Use the left panel to switch between Create, Modify, and Inspect modes.
              </p>
              <p className="text-zinc-400">
                Grid size: {gridSize === 'none' ? 'Off' : gridSize}px
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right info panel */}
      <div className="fixed right-0 top-20 h-screen w-24 bg-white border-l border-indigo-200 flex flex-col">
        <div className="flex-1 border-b border-indigo-200 px-3 py-2 text-left text-sm text-zinc-600">
          Properties
        </div>
        <div className="flex-1 px-3 py-2 text-left text-xs text-zinc-500">
          <div>Status: Ready</div>
          <div>Components: 0</div>
        </div>
      </div>
    </div>
  );
}