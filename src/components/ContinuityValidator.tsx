import { useRef, useState } from 'react';
import {
  ShieldCheck,
  Upload,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  ScanEye,
} from 'lucide-react';
import type {
  CameraRig,
  CategoryLocks,
  ConsistencyMode,
  GeneratedShot,
  ReferenceItem,
  SpatialObject,
  ValidationIssue,
  ValidationReport,
} from '../types.ts';
import { compressImageFile, urlToCompressedDataUrl } from '../utils/imageHelpers.ts';
import { formatCameraSpatialBrief } from '../utils/spatialMath.ts';

interface ContinuityValidatorProps {
  shots: GeneratedShot[];
  references: ReferenceItem[];
  spatialObjects: SpatialObject[];
  cameras: CameraRig[];
  consistencyMode: ConsistencyMode;
  categoryLocks: CategoryLocks;
  validationReports: ValidationReport[];
  onAttachShotImage: (shotId: string, dataUrl: string) => void;
  onAddValidationReport: (report: ValidationReport) => void;
}

const CATEGORY_LABEL: Record<ValidationIssue['category'], string> = {
  object_displacement: 'Object Displacement',
  architectural_change: 'Architectural Change',
  character_inconsistency: 'Character Inconsistency',
  lighting_drift: 'Lighting Drift',
  prompt_contradiction: 'Prompt Contradiction',
};

function SeverityBadge({ severity }: { severity: ValidationIssue['severity'] }) {
  if (severity === 'conflict') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Conflict
      </span>
    );
  }
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400">
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
      Observation
    </span>
  );
}

export function ContinuityValidator({
  shots,
  references,
  spatialObjects,
  cameras,
  consistencyMode,
  categoryLocks,
  validationReports,
  onAttachShotImage,
  onAddValidationReport,
}: ContinuityValidatorProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string>(shots[0]?.id ?? '');
  const [auditingPrompts, setAuditingPrompts] = useState(false);
  const [auditingImage, setAuditingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShot = shots.find((s) => s.id === selectedShotId) ?? shots[0] ?? null;

  const runPromptAudit = async () => {
    if (shots.length === 0) {
      setError('Generate shots first before auditing prompts.');
      return;
    }
    setAuditingPrompts(true);
    setError(null);
    try {
      const cameraBriefs = cameras.map((c) => formatCameraSpatialBrief(c, spatialObjects));
      const res = await fetch('/api/validate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shots: shots.map(({ uploadedResultDataUrl: _omit, ...rest }) => rest),
          references: references.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            visionSummary: r.visionSummary,
            extractedDetails: r.extractedDetails,
          })),
          spatialObjects,
          cameraBriefs,
          consistencyMode,
          categoryLocks,
        }),
      });
      const data = (await res.json()) as ValidationReport & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Prompt audit failed.');
      }
      onAddValidationReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prompt audit failed');
    } finally {
      setAuditingPrompts(false);
    }
  };

  const handleUploadResult = async (files: FileList | null) => {
    if (!files || !files[0] || !selectedShot) return;
    const compressed = await compressImageFile(files[0]);
    onAttachShotImage(selectedShot.id, compressed.dataUrl);
  };

  const runImageComparison = async () => {
    if (!selectedShot || !selectedShot.uploadedResultDataUrl) {
      setError('Upload a generated image result for the selected shot first.');
      return;
    }
    setAuditingImage(true);
    setError(null);
    try {
      const assignedRefs = references.filter((r) =>
        selectedShot.assignedReferenceIds.includes(r.id)
      );
      const fallbackRefs = assignedRefs.length > 0 ? assignedRefs : references.slice(0, 3);
      const preparedRefs = await Promise.all(
        fallbackRefs.map(async (r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          dataUrl: r.dataUrl.startsWith('data:')
            ? r.dataUrl
            : (await urlToCompressedDataUrl(r.dataUrl)).dataUrl,
        }))
      );

      const cam = cameras.find((c) => c.id === selectedShot.cameraId) ?? cameras[0];
      const cameraBrief = cam
        ? formatCameraSpatialBrief(cam, spatialObjects)
        : 'Camera position not mapped';

      const res = await fetch('/api/validate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shot: {
            shotNumber: selectedShot.shotNumber,
            shotTitle: selectedShot.shotTitle,
            cameraId: selectedShot.cameraId,
            composition: selectedShot.composition,
            lighting: selectedShot.lighting,
            prompt: selectedShot.prompt,
            worldSpaceAnchorNote: selectedShot.worldSpaceAnchorNote,
          },
          generatedImageDataUrl: selectedShot.uploadedResultDataUrl,
          referenceImages: preparedRefs,
          cameraBrief,
        }),
      });
      const data = (await res.json()) as ValidationReport & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Visual comparison failed.');
      }
      onAddValidationReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Visual comparison failed');
    } finally {
      setAuditingImage(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-50">
              Continuity Validator
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Detect prompt contradictions against your spatial lock, or upload generated images to inspect object displacement, architectural drift, and character consistency.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void runPromptAudit()}
            disabled={auditingPrompts || shots.length === 0}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            {auditingPrompts ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{auditingPrompts ? 'Auditing Prompts...' : 'Audit Generated Prompts'}</span>
          </button>
        </div>

        {/* Visual Image Comparison Section */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-[#0B0F17] p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Visual Result Comparison (Upload Generated Frame)
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Select a shot, upload the image produced by your external generator, and compare it against assigned references.
          </p>

          {shots.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">
              Generate shot prompts first to compare generated visual outputs.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] items-start">
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Select Shot to Validate</span>
                  <select
                    value={selectedShot?.id || ''}
                    onChange={(e) => setSelectedShotId(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-800 bg-[#10151F] px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    {shots.map((s) => (
                      <option key={s.id} value={s.id}>
                        Shot {String(s.shotNumber).padStart(2, '0')} · {s.shotTitle} ({s.cameraId})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2.5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void handleUploadResult(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-[#10151F] px-4 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                    <span>
                      {selectedShot?.uploadedResultDataUrl
                        ? 'Replace Generated Image'
                        : 'Upload Generated Image'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={!selectedShot?.uploadedResultDataUrl || auditingImage}
                    onClick={() => void runImageComparison()}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
                  >
                    {auditingImage ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{auditingImage ? 'Comparing Vision...' : 'Compare vs References'}</span>
                  </button>
                </div>
              </div>

              {selectedShot?.uploadedResultDataUrl && (
                <div className="w-full md:w-56 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                  <img
                    src={selectedShot.uploadedResultDataUrl}
                    alt={`Uploaded result for Shot ${selectedShot.shotNumber}`}
                    referrerPolicy="no-referrer"
                    className="aspect-video w-full object-cover"
                  />
                  <div className="px-2.5 py-1.5 font-mono text-[11px] text-slate-400">
                    Shot {String(selectedShot.shotNumber).padStart(2, '0')} Result
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Validation Reports History */}
      {validationReports.length === 0 ? (
        <section className="rounded-xl border border-slate-800/70 bg-[#10151F]/60 p-6 text-center text-xs text-slate-500">
          No continuity reports run yet. Click &ldquo;Audit Generated Prompts&rdquo; or upload a generated frame above.
        </section>
      ) : (
        <div className="space-y-4">
          {validationReports.map((report) => (
            <section
              key={report.id}
              className="rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:p-6 space-y-4"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-100">
                    {report.mode === 'prompts'
                      ? 'Prompt Continuity Audit'
                      : `Visual Comparison · Shot ${String(report.shotNumber || 1).padStart(2, '0')}`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Checked {new Date(report.checkedAt).toLocaleString()}
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-300 tabular-nums">
                  {report.issues.length} {report.issues.length === 1 ? 'finding' : 'findings'}
                </span>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed">{report.summary}</p>

              {report.issues.length > 0 && (
                <div className="space-y-3">
                  {report.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3.5 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <SeverityBadge severity={issue.severity} />
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-300 font-medium">
                            {CATEGORY_LABEL[issue.category] || issue.category}
                          </span>
                          {issue.shotNumber && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="font-mono text-slate-400">
                                Shot {String(issue.shotNumber).padStart(2, '0')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-100">{issue.title}</p>
                      <p className="text-xs leading-relaxed text-slate-300">{issue.detail}</p>
                      <p className="text-xs text-blue-300 pt-1">
                        Suggestion: {issue.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <p className="border-t border-slate-800/80 pt-3 text-[11px] leading-relaxed text-slate-500">
                {report.disclaimer}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
