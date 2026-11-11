import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Check, Download, ExternalLink, FileUp, HelpCircle, Info, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { Button, Spinner, cx } from '../components/ui';

export const CADIT_ORIGIN = 'https://app.cadit.app';
export const CADIT_WHITELISTED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://cookiecad.github.io',
  'https://simplyprint.io',
  'https://app.cookiecad.com'
];

export interface CaditEditorProps {
  documentName?: string;
  partnerName?: string;
  onExportStl?: (blob: Blob, filename: string) => Promise<void> | void;
  onClose?: () => void;
  fullViewport?: boolean;
  className?: string;
}

export function CaditEditor({
  documentName = 'Product 3D Part',
  partnerName = 'SolutionVelocity',
  onExportStl,
  onClose,
  fullViewport = false,
  className
}: CaditEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(fullViewport);
  const [statusText, setStatusText] = useState<string>('Initializing 3D CAD environment…');
  const [lastExport, setLastExport] = useState<{ filename: string; size: number } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);

  // Sync isFullscreen with fullViewport prop
  useEffect(() => {
    setIsFullscreen(fullViewport);
  }, [fullViewport]);

  // Handshake detection timeout
  useEffect(() => {
    if (isReady) return;
    const timer = window.setTimeout(() => {
      if (!isReady) {
        setIsStandalone(true);
        setStatusText('Interactive Studio ready');
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [isReady, iframeKey]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== CADIT_ORIGIN) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      const { type, payload } = data as { type?: string; payload?: any };

      switch (type) {
        case 'ready':
          setIsReady(true);
          setIsStandalone(false);
          setStatusText('1-Click Export Active');
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'init',
              payload: {
                partnerName,
                features: ['export']
              }
            },
            CADIT_ORIGIN
          );
          break;

        case 'export-stl': {
          setIsExporting(false);
          let raw = payload?.blob as unknown;
          const filename = (payload?.filename as string | undefined) || `${documentName.replace(/[^a-z0-9_-]/gi, '_')}.stl`;

          let blob: Blob | null = null;
          if (raw instanceof Blob) {
            blob = raw;
          } else if (raw) {
            blob = new Blob([raw as BlobPart], { type: 'model/stl' });
          }

          if (blob && blob.size > 0) {
            setLastExport({ filename, size: blob.size });
            setStatusText(`Exported ${(blob.size / 1024).toFixed(0)} KB`);

            if (onExportStl) {
              void onExportStl(blob, filename);
            } else {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(url);
            }
          }
          break;
        }

        default:
          break;
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onClose) onClose();
        else if (isFullscreen) setIsFullscreen(false);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [documentName, partnerName, onExportStl, isFullscreen, onClose]);

  const requestStlExport = () => {
    if (isReady && iframeRef.current?.contentWindow) {
      setIsExporting(true);
      setStatusText('Compiling 3D mesh…');
      iframeRef.current.contentWindow.postMessage({ type: 'get-stl' }, CADIT_ORIGIN);
    } else {
      // In standalone mode (e.g. non-whitelisted parent origin), trigger file picker
      setShowGuidance(true);
      fileInputRef.current?.click();
    }
  };

  const handleManualImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastExport({ filename: file.name, size: file.size });
    setStatusText(`Saved ${(file.size / 1024).toFixed(0)} KB`);
    if (onExportStl) {
      void onExportStl(file, file.name);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowGuidance(false);
  };

  const reloadIframe = () => {
    setIsReady(false);
    setIsStandalone(false);
    setStatusText('Reloading 3D engine…');
    setIframeKey((prev) => prev + 1);
  };

  const iframeSrc = `${CADIT_ORIGIN}/new?embed=true&partnerName=${encodeURIComponent(partnerName)}`;
  const isEdgeToEdge = isFullscreen || fullViewport;
  const isPort5173 = typeof window !== 'undefined' && window.location.port === '5173';

  return (
    <div
      className={cx(
        'group flex flex-col overflow-hidden transition-all',
        isEdgeToEdge
          ? 'fixed inset-0 z-[100] h-screen w-screen bg-[#1b1c1e] text-white p-0'
          : 'h-[740px] w-full rounded-xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
        className
      )}
    >
      {/* Hidden file input for manual STL import / standalone mode sync */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".stl"
        onChange={handleManualImport}
        className="hidden"
      />

      {/* 3D CAD Top Studio Navigation Bar */}
      <header className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/95 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex items-center gap-3">
          {onClose && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onClose}
              icon={<ArrowLeft className="h-4 w-4" />}
              className="font-medium"
            >
              Exit Studio
            </Button>
          )}

          <div className="flex items-center gap-2">
            <span
              className={cx(
                'relative flex h-2.5 w-2.5 rounded-full transition-colors',
                isReady ? 'bg-emerald-500' : isStandalone ? 'bg-blue-500' : 'bg-amber-400'
              )}
            >
              {isReady && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
            </span>
            <span className="text-sm font-bold tracking-tight text-slate-800 dark:text-zinc-100">
              {documentName}
            </span>
            <span className="hidden rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 sm:inline dark:bg-blue-950/60 dark:text-blue-300">
              CADit 3D Studio
            </span>
          </div>

          <div className="hidden h-4 w-px bg-slate-300 sm:block dark:bg-zinc-700" />

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            {!isReady && !isStandalone ? (
              <span className="flex items-center gap-1.5">
                <Spinner label="Loading CADit" /> Connecting 3D engine…
              </span>
            ) : (
              <span className="font-mono text-[11px]">{statusText}</span>
            )}
          </div>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-2">
          {lastExport && (
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 lg:flex dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              <span>
                Saved: {lastExport.filename} ({(lastExport.size / 1024).toFixed(0)} KB)
              </span>
            </div>
          )}

          {isStandalone && isPort5173 && (
            <span
              title="CADit's embed SDK whitelists localhost:3000. Run 'PORT=3000 npm run dev' for automatic 1-click export!"
              className="hidden xl:inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
            >
              <Info className="h-3 w-3" /> Tip: Run on port 3000 for 1-click export
            </span>
          )}

          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            icon={<FileUp className="h-4 w-4" />}
            className="text-xs font-medium"
            title="Import an STL directly into this product"
          >
            Import STL
          </Button>

          <Button
            size="sm"
            variant="primary"
            disabled={isExporting}
            onClick={requestStlExport}
            icon={<Download className="h-4 w-4" />}
            className="shadow-sm font-semibold"
            title={
              isReady
                ? 'Export model mesh directly from CADit and save revision'
                : 'Save STL from CADit to product revisions'
            }
          >
            {isExporting ? 'Generating STL…' : 'Export & Save STL'}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            title="Reload 3D canvas"
            onClick={reloadIframe}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          />

          {!onClose && (
            <Button
              size="sm"
              variant="secondary"
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
              onClick={() => setIsFullscreen((prev) => !prev)}
              icon={isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            />
          )}

          <a
            href={iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            title="Open CADit in a dedicated browser tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          {onClose && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onClose}
              icon={<X className="h-4 w-4" />}
              title="Close 3D Studio"
            />
          )}
        </div>
      </header>

      {/* Standalone helper guidance notice when triggered */}
      {showGuidance && !isReady && (
        <div className="flex items-center justify-between gap-3 bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-inner">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              <strong>How to save from CADit:</strong> In CADit&apos;s menu, click <em>Export &gt; STL</em>, then select your downloaded file here to record it in product history.
            </span>
          </div>
          <button
            onClick={() => setShowGuidance(false)}
            className="rounded p-1 hover:bg-blue-700"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 100% Height / Width 3D Canvas */}
      <div className="relative flex-1 w-full bg-[#1b1c1e]">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={iframeSrc}
          title="CADit 3D Modeling Studio"
          allow="clipboard-read; clipboard-write; fullscreen"
          allowFullScreen
          className="h-full w-full border-none"
        />
      </div>
    </div>
  );
}
