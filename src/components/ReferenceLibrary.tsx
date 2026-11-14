import { useRef, useState } from 'react';
import {
  Upload,
  ScanEye,
  Trash2,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import type { ReferenceCategory, ReferenceItem } from '../types.ts';
import { compressImageFile, urlToCompressedDataUrl } from '../utils/imageHelpers.ts';

interface ReferenceLibraryProps {
  references: ReferenceItem[];
  onAddReferences: (items: ReferenceItem[]) => void;
  onUpdateReference: (id: string, patch: Partial<ReferenceItem>) => void;
  onRemoveReference: (id: string) => void;
}

const CATEGORIES: Array<{ id: ReferenceCategory; label: string; prefix: string }> = [
  { id: 'character', label: 'Character', prefix: 'CHAR' },
  { id: 'background', label: 'Background', prefix: 'LOC' },
  { id: 'prop', label: 'Prop', prefix: 'PROP' },
  { id: 'lighting', label: 'Lighting', prefix: 'LIGHT' },
];

function nextRefId(category: ReferenceCategory, existing: ReferenceItem[]): string {
  const prefix = CATEGORIES.find((c) => c.id === category)?.prefix || 'REF';
  let maxNum = 0;
  for (const item of existing) {
    if (item.id.startsWith(`${prefix}_`)) {
      const n = Number.parseInt(item.id.slice(prefix.length + 1), 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return `${prefix}_${String(maxNum + 1).padStart(2, '0')}`;
}

export function ReferenceLibrary({
  references,
  onAddReferences,
  onUpdateReference,
  onRemoveReference,
}: ReferenceLibraryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadCategory, setUploadCategory] = useState<ReferenceCategory>('character');
  const [filterCategory, setFilterCategory] = useState<'all' | ReferenceCategory>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const currentRefs = [...references];
    const newItems: ReferenceItem[] = [];

    for (const file of files) {
      const compressed = await compressImageFile(file);
      const id = nextRefId(uploadCategory, [...currentRefs, ...newItems]);
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      newItems.push({
        id,
        name: baseName || id,
        category: uploadCategory,
        dataUrl: compressed.dataUrl,
        mimeType: compressed.mimeType,
        width: compressed.width,
        height: compressed.height,
        analysisStatus: 'idle',
      });
    }

    onAddReferences(newItems);
  };

  const analyzeSingle = async (item: ReferenceItem) => {
    onUpdateReference(item.id, { analysisStatus: 'analyzing', analysisError: undefined });
    try {
      const prepared = item.dataUrl.startsWith('data:')
        ? item.dataUrl
        : (await urlToCompressedDataUrl(item.dataUrl)).dataUrl;

      const res = await fetch('/api/analyze-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.name,
          category: item.category,
          dataUrl: prepared,
        }),
      });
      const data = (await res.json()) as {
        visionSummary?: string;
        extractedDetails?: string[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Vision analysis failed.');
      }
      onUpdateReference(item.id, {
        analysisStatus: 'done',
        visionSummary: data.visionSummary || '',
        extractedDetails: data.extractedDetails || [],
      });
    } catch (err) {
      onUpdateReference(item.id, {
        analysisStatus: 'error',
        analysisError: err instanceof Error ? err.message : 'Failed to analyze image',
      });
    }
  };

  const analyzeAllPending = async () => {
    const targets = references.filter((r) => r.analysisStatus !== 'done');
    if (targets.length === 0) return;
    setBatchAnalyzing(true);
    for (const item of targets) {
      await analyzeSingle(item);
    }
    setBatchAnalyzing(false);
  };

  const visibleRefs =
    filterCategory === 'all'
      ? references
      : references.filter((r) => r.category === filterCategory);

  const pendingCount = references.filter((r) => r.analysisStatus !== 'done').length;

  return (
    <section className="rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-50">
            01. Reference Library
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Upload visual references and extract visible details with Gemini Vision.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={analyzeAllPending}
              disabled={batchAnalyzing}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {batchAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Analyze Pending ({pendingCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Upload Controls + Category Selector */}
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-dashed p-4 transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-500/10'
              : 'border-slate-700/80 bg-[#0B0F17]/70 hover:border-slate-600'
          }`}
        >
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800/80 text-blue-400">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">
                Add images as{' '}
                <span className="text-blue-400">
                  {CATEGORIES.find((c) => c.id === uploadCategory)?.label}
                </span>{' '}
                references
              </p>
              <p className="text-xs text-slate-400">
                Drag and drop multiple files or tap browse (PNG, JPG, WebP)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
            <select
              aria-label="Upload category"
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as ReferenceCategory)}
              className="min-h-[42px] rounded-lg border border-slate-700 bg-[#121927] px-3 text-xs font-medium text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/90 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <ImageIcon className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
              <span>Browse Files</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Segmented Control */}
      <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterCategory('all')}
          className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            filterCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-[#0B0F17] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          All ({references.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = references.filter((r) => r.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilterCategory(cat.id)}
              className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                filterCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#0B0F17] text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Reference Grid */}
      {visibleRefs.length === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-800/70 bg-[#0B0F17]/60 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-300">No references in this view yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Upload character portraits, location photos, props, or lighting frames above.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRefs.map((item) => (
            <article
              key={item.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-800/90 bg-[#0B0F17]"
            >
              {/* Image Preview */}
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900">
                <img
                  src={item.dataUrl}
                  alt={item.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-xs text-slate-200">
                  <span className="font-mono font-medium tracking-tight">{item.id}</span>
                  <span className="text-slate-300 capitalize">{item.category}</span>
                </div>
              </div>

              {/* Card Body */}
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  {editingId === item.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={item.name}
                      onChange={(e) => onUpdateReference(item.id, { name: e.target.value })}
                      onBlur={() => setEditingId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingId(null);
                      }}
                      className="w-full rounded border border-blue-500 bg-[#121927] px-2 py-1 text-sm font-medium text-slate-100 focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-100">
                        {item.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        aria-label={`Rename ${item.name}`}
                        className="p-1 text-slate-500 hover:text-slate-200 rounded"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  <select
                    aria-label={`Category for ${item.name}`}
                    value={item.category}
                    onChange={(e) =>
                      onUpdateReference(item.id, {
                        category: e.target.value as ReferenceCategory,
                      })
                    }
                    className="rounded border border-slate-800 bg-[#121927] px-2 py-1 text-xs text-slate-300 focus:border-blue-500 focus:outline-none shrink-0"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vision Analysis Output */}
                {item.analysisStatus === 'done' && item.visionSummary ? (
                  <div className="space-y-2 text-xs leading-relaxed text-slate-300">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Vision Details Extracted</span>
                    </div>
                    <p className="text-slate-300">{item.visionSummary}</p>
                    {item.extractedDetails && item.extractedDetails.length > 0 && (
                      <ul className="space-y-1 border-t border-slate-800/80 pt-2 text-slate-400">
                        {item.extractedDetails.slice(0, 4).map((d, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-blue-400">·</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : item.analysisStatus === 'error' ? (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" aria-hidden="true" />
                    <span>{item.analysisError || 'Analysis failed.'}</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Run Gemini Vision to extract wardrobe, geometry, texture, and lighting anchors.
                  </p>
                )}

                {/* Actions */}
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                  <button
                    type="button"
                    onClick={() => void analyzeSingle(item)}
                    disabled={item.analysisStatus === 'analyzing'}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#121927] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {item.analysisStatus === 'analyzing' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" aria-hidden="true" />
                    ) : (
                      <ScanEye className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                    )}
                    <span>
                      {item.analysisStatus === 'analyzing'
                        ? 'Analyzing...'
                        : item.analysisStatus === 'done'
                          ? 'Re-analyze'
                          : 'Analyze Vision'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveReference(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
