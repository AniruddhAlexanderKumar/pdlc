import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, ExternalLink, Maximize2, Minimize2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button, Card, Spinner, cx } from '../components/ui';

export const CADIT_ORIGIN = 'https://app.cadit.app';

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
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(fullViewport);
  const [statusText, setStatusText] = useState<string>('Initializing 3D CAD environment…');
  const [lastExport, setLastExport] = useState<{ filename: string; size: number } | null>(null);

  // Sync isFullscreen with fullViewport prop
  useEffect(() => {
    setIsFullscreen(fullViewport);
  }, [fullViewport]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== CADIT_ORIGIN) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      const { type, payload } = data as { type?: string; payload?: any };

      switch (type) {
        case 'ready':
          setIsReady(true);
          setStatusText('Ready');
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
          const blob = payload?.blob as Blob | undefined;
          const filename = (payload?.filename as string | undefined) || `${documentName.replace(/[^a-z0-9_-]/gi, '_')}.stl`;

          if (blob) {
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
    if (!iframeRef.current?.contentWindow || !isReady) return;
    setIsExporting(true);
    setStatusText('Compiling 3D mesh…');
    iframeRef.current.contentWindow.postMessage({ type: 'get-stl' }, CADIT_ORIGIN);
  };

  const reloadIframe = () => {
    setIsReady(false);
    setStatusText('Reloading 3D engine…');
    if (iframeRef.current) {
      iframeRef.current.src = iframeSrc;
    }
  };

  const iframeSrc = `${CADIT_ORIGIN}/new?embed=true&partnerName=${encodeURIComponent(partnerName)}`;

  const isEdgeToEdge = isFullscreen || fullViewport;

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
                isReady ? 'bg-emerald-500' : 'bg-amber-400'
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
              Full-Screen 3D Studio
            </span>
          </div>

          <div className="hidden h-4 w-px bg-slate-300 sm:block dark:bg-zinc-700" />

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            {!isReady ? (
              <span className="flex items-center gap-1.5">
                <Spinner label="Loading CADit" /> Initializing 3D engine…
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

          <Button
            size="sm"
            variant="primary"
            disabled={!isReady || isExporting}
            onClick={requestStlExport}
            icon={<Download className="h-4 w-4" />}
            className="shadow-sm font-semibold"
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

      {/* 100% Height / Width 3D Canvas */}
      <div className="relative flex-1 w-full bg-[#1b1c1e]">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="CADit 3D Modeling Studio"
          allow="clipboard-read; clipboard-write"
          className="h-full w-full border-none"
        />
      </div>
    </div>
  );
}
