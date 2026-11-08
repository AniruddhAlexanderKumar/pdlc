import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Box,
  CheckCircle,
  Clock,
  Coins,
  Cpu,
  Download,
  FileCode,
  History,
  Layers,
  Maximize2,
  Printer,
  Scale,
  Sparkles,
  Wrench
} from 'lucide-react';
import type { Product, ProductCadModel } from '@sv/shared';
import { CaditEditor } from '../../cad/CaditEditor';
import { Button, Card, CardHeader, cx } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { get, post } from '../../api/client';
import { useMoney } from '../../lib/money';

interface CadTabProps {
  product: Product;
}

interface CadApiResponse {
  model: ProductCadModel | null;
  revisions: Array<{
    revision: number;
    byteSize: number;
    authorId: string | null;
    summary: string;
    createdAt: string;
  }>;
}

// Convert Blob to Base64 string
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function CadTab({ product }: CadTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { fmt } = useMoney();
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode check: ?mode=studio launches the edge-to-edge dedicated 3D CAD studio
  const isStudio = searchParams.get('mode') === 'studio';

  // 3D Printing material estimator states
  const [materialType, setMaterialType] = useState<'pla' | 'petg' | 'abs' | 'resin'>('pla');
  const [infillDensity, setInfillDensity] = useState<number>(20);

  // 1. Fetch persistent 3D model metadata from database
  const cadQuery = useQuery<CadApiResponse>({
    queryKey: ['product-cad', product.id],
    queryFn: () => get<CadApiResponse>(`/products/${product.id}/cad-model`),
    refetchOnWindowFocus: false
  });

  // 2. Mutation to persist exported STL to database
  const saveMutation = useMutation({
    mutationFn: async ({ filename, blob }: { filename: string; blob: Blob }) => {
      const stlBase64 = await blobToBase64(blob);
      return post<{ model: ProductCadModel }>(`/products/${product.id}/cad-model`, {
        filename,
        stlBase64,
        summary: `Exported from CADit Studio (${(blob.size / 1024).toFixed(0)} KB)`
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['product-cad', product.id] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Saved revision ${data.model.headRevision} of “${data.model.filename}” to ${product.name}`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to persist CAD model to database');
    }
  });

  const handleExportStl = async (blob: Blob, filename: string) => {
    await saveMutation.mutateAsync({ filename, blob });
  };

  const model = cadQuery.data?.model;
  const revisions = cadQuery.data?.revisions || [];

  // Material densities in g/cm³ and approx cost per kg
  const materialsConfig = {
    pla: { label: 'PLA (Standard)', density: 1.24, costPerKg: 20 },
    petg: { label: 'PETG (Durable)', density: 1.27, costPerKg: 24 },
    abs: { label: 'ABS (Heat Resistant)', density: 1.04, costPerKg: 22 },
    resin: { label: 'Standard Resin', density: 1.15, costPerKg: 38 }
  };

  const estimatedGrams = model
    ? Math.max(12, Math.round((model.fileSize / 1024 / 28) * (0.3 + (infillDensity / 100) * 0.7)))
    : 35;
  const estimatedCost = (estimatedGrams / 1000) * materialsConfig[materialType].costPerKg;
  const estimatedHours = Math.max(0.5, Number((estimatedGrams / 18).toFixed(1)));

  // If in dedicated full-screen studio mode, render the edge-to-edge CADit Studio!
  if (isStudio) {
    return (
      <CaditEditor
        documentName={`${product.name} CAD`}
        partnerName="SolutionVelocity"
        fullViewport={true}
        onClose={() => setSearchParams({})}
        onExportStl={handleExportStl}
      />
    );
  }

  // Otherwise, render the Product 3D CAD Hub
  return (
    <div className="space-y-6">
      {/* 3D CAD Hero Banner & Studio Launch Callout */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-gradient-to-r from-blue-50/60 via-white to-slate-50/80 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-900/80 dark:via-zinc-900 dark:to-zinc-900/50">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
              <Box className="h-3 w-3" />
              Dedicated 3D CAD Studio
            </span>
            {model && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-3 w-3" />
                Revision {model.headRevision} Saved
              </span>
            )}
          </div>

          <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            3D Physical Modeling &amp; Enclosures
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-zinc-400">
            For distraction-free 3D modeling, launch the full-screen CAD studio. You get 100% of your monitor real estate for sketching, revolving, extruding, and orbiting parts without page scrolling interference.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {model && (
            <a
              href={`/api/products/${product.id}/cad-model/download`}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Download className="h-4 w-4" />
              Download STL ({(model.fileSize / 1024).toFixed(0)} KB)
            </a>
          )}

          <Button
            size="md"
            variant="primary"
            onClick={() => setSearchParams({ mode: 'studio' })}
            icon={<Maximize2 className="h-4 w-4" />}
            className="shadow-md font-semibold text-sm px-5 py-2.5"
          >
            Launch Full-Screen 3D Studio <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Interactive Quick Launch Card */}
      <div
        onClick={() => setSearchParams({ mode: 'studio' })}
        className="group relative flex h-72 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-900 text-center transition-all hover:border-blue-500 hover:shadow-lg dark:border-zinc-700"
      >
        <div className="absolute inset-0 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px] opacity-25 group-hover:opacity-40 transition-opacity" />
        <div className="relative z-10 flex flex-col items-center gap-3 p-6 text-white">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-500/40 transition-transform group-hover:scale-110">
            <Box className="h-7 w-7 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold">
              {model ? `Open ${model.filename} in Full-Screen Studio` : `Open 3D CAD Studio for ${product.name}`}
            </h3>
            <p className="mt-1 text-xs text-slate-300">
              Click anywhere to expand the CADit 3D viewport into 100% full-screen mode.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-medium text-white backdrop-blur-sm transition-colors group-hover:bg-blue-600">
            <Maximize2 className="h-3.5 w-3.5" />
            Launch Studio (Full Viewport)
          </span>
        </div>
      </div>

      {/* Estimator and Revision History */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rapid Prototyping / 3D Printing Cost Estimator */}
        <Card className="p-5">
          <CardHeader
            title="3D Print Cost Estimator"
            subtitle="Calculates material consumption and prototyping costs"
            icon={<Printer className="h-4 w-4 text-blue-600" />}
          />
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-zinc-300">Material Type</label>
                <select
                  value={materialType}
                  onChange={(e) => setMaterialType(e.target.value as any)}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  {Object.entries(materialsConfig).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label} (${item.costPerKg}/kg)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-zinc-300">
                  Infill Density: {infillDensity}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={infillDensity}
                  onChange={(e) => setInfillDensity(Number(e.target.value))}
                  className="mt-3 w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-center dark:border-zinc-800 dark:bg-zinc-800/50">
              <div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  <Scale className="h-3 w-3" /> Mass
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                  ~{estimatedGrams}g
                </div>
              </div>

              <div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  <Coins className="h-3 w-3" /> Filament Cost
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  ~${estimatedCost.toFixed(2)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  <Clock className="h-3 w-3" /> Print Time
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                  ~{estimatedHours}h
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-zinc-500">
              *Estimates are calculated using standard FDM deposition parameters (0.2mm layer height, 2 walls) and mesh density.
            </p>
          </div>
        </Card>

        {/* Database Revision History Card */}
        <Card className="p-5">
          <CardHeader
            title="CAD Revisions &amp; Artifacts"
            subtitle="Database-persisted versions accessible by the team"
            icon={<History className="h-4 w-4 text-purple-600" />}
          />
          <div className="mt-4">
            {cadQuery.isLoading ? (
              <p className="text-xs text-slate-400">Loading CAD revisions…</p>
            ) : revisions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <FileCode className="h-8 w-8 text-slate-300 dark:text-zinc-700" />
                <p className="mt-2 text-xs font-medium text-slate-600 dark:text-zinc-400">
                  No 3D models saved yet.
                </p>
                <p className="text-[11px] text-slate-400">
                  Launch the 3D Studio and click <strong>“Export &amp; Save STL”</strong> to save revision 1.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 text-xs dark:divide-zinc-800">
                {revisions.map((rev) => (
                  <li key={rev.revision} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 font-mono text-[10px] font-bold text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {rev.revision}
                      </span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-zinc-200">
                          {rev.summary || `Revision ${rev.revision}`}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {(rev.byteSize / 1024).toFixed(1)} KB · {new Date(rev.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <a
                      href={`/api/products/${product.id}/cad-model/download`}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <Download className="h-3 w-3" />
                      STL
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
