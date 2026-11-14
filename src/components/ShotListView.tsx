import { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  FileJson,
  FileText,
  Film,
  ArrowLeft,
} from 'lucide-react';
import type { CameraRig, GeneratedShot, ReferenceItem } from '../types.ts';

interface ShotListViewProps {
  projectName: string;
  shots: GeneratedShot[];
  references: ReferenceItem[];
  cameras: CameraRig[];
  onUpdateShotPrompt: (shotId: string, prompt: string) => void;
  onBackToStudio: () => void;
  onGoToValidator: () => void;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ShotListView({
  projectName,
  shots,
  references,
  cameras,
  onUpdateShotPrompt,
  onBackToStudio,
  onGoToValidator,
}: ShotListViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cameraFilter, setCameraFilter] = useState<string>('all');

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId((curr) => (curr === key ? null : curr)), 1800);
  };

  const exportJson = () => {
    const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const payload = {
      projectName,
      exportedAt: new Date().toISOString(),
      totalShots: shots.length,
      shots: shots.map(({ uploadedResultDataUrl: _omit, ...rest }) => rest),
    };
    downloadBlob(JSON.stringify(payload, null, 2), `${slug}-shots.json`, 'application/json');
  };

  const exportText = () => {
    const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const lines = [
      `KITTU AI — SHOT LIST: ${projectName}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Total Shots: ${shots.length}`,
      '='.repeat(60),
      '',
      ...shots.flatMap((s) => [
        `SHOT ${String(s.shotNumber).padStart(2, '0')} — ${s.shotTitle}`,
        `Type: ${s.shotType} | Camera: ${s.cameraId} (${s.cameraAngle}, ${s.lens})`,
        `IDs: Characters [${s.characterIds.join(', ') || 'None'}] | Locations [${
          s.locationIds.join(', ') || 'None'
        }] | Props [${s.propIds.join(', ') || 'None'}] | Lighting [${
          s.lightingIds.join(', ') || 'None'
        }]`,
        `Assigned References: ${s.assignedReferenceIds.join(', ') || 'None'}`,
        `World-Space Anchor: ${s.worldSpaceAnchorNote}`,
        `Lighting: ${s.lighting}`,
        `Composition: ${s.composition}`,
        '',
        'PROMPT:',
        s.prompt,
        '',
        'TELUGU-ENGLISH EXPLANATION:',
        s.teluguEnglishExplanation,
        '-'.repeat(60),
        '',
      ]),
    ];
    downloadBlob(lines.join('\n'), `${slug}-shots.txt`, 'text/plain;charset=utf-8');
  };

  const filteredShots =
    cameraFilter === 'all'
      ? shots
      : shots.filter((s) => s.cameraId === cameraFilter);

  if (shots.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800/90 bg-[#10151F] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/70 text-blue-400">
          <Film className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold text-slate-100">
          No Shots Generated Yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
          Add references, confirm your 2D spatial floor plan, and run Shot Prompt Generation from the Studio tab.
        </p>
        <button
          type="button"
          onClick={onBackToStudio}
          className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Go to Studio</span>
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <section className="flex flex-col gap-4 rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-50">
            Shot-by-Shot Generation Prompts
          </h2>
          <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
            {shots.length} shots generated · World-space positions preserved across all cuts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void copyText(
                'ALL_PROMPTS',
                shots.map((s) => `Shot ${s.shotNumber}: ${s.prompt}`).join('\n\n')
              )
            }
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors whitespace-nowrap"
          >
            {copiedId === 'ALL_PROMPTS' ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
            )}
            <span>{copiedId === 'ALL_PROMPTS' ? 'Copied All' : 'Copy All'}</span>
          </button>

          <button
            type="button"
            onClick={exportJson}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors whitespace-nowrap"
          >
            <FileJson className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={exportText}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors whitespace-nowrap"
          >
            <FileText className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
            <span>Export Text</span>
          </button>

          <button
            type="button"
            onClick={onGoToValidator}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 rotate-180 hidden" aria-hidden="true" />
            <span>Run Continuity Check</span>
          </button>
        </div>
      </section>

      {/* Camera Filter Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCameraFilter('all')}
          className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            cameraFilter === 'all'
              ? 'bg-blue-600 text-white'
              : 'border border-slate-800 bg-[#10151F] text-slate-400 hover:text-slate-200'
          }`}
        >
          All Cameras ({shots.length})
        </button>
        {cameras.map((cam) => {
          const count = shots.filter((s) => s.cameraId === cam.id).length;
          return (
            <button
              key={cam.id}
              type="button"
              onClick={() => setCameraFilter(cam.id)}
              className={`min-h-[38px] rounded-lg px-3.5 py-1.5 font-mono text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                cameraFilter === cam.id
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-800 bg-[#10151F] text-slate-400 hover:text-slate-200'
              }`}
            >
              {cam.id} ({count})
            </button>
          );
        })}
      </div>

      {/* Shot Cards */}
      <div className="space-y-4">
        {filteredShots.map((shot) => {
          const assignedRefs = references.filter((r) =>
            shot.assignedReferenceIds.includes(r.id)
          );

          return (
            <article
              key={shot.id}
              className="rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:p-6"
            >
              {/* Shot Header */}
              <div className="flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono font-semibold text-blue-400 tabular-nums">
                      SHOT {String(shot.shotNumber).padStart(2, '0')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{shot.shotType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-300">{shot.cameraId}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{shot.lens}</span>
                    <span aria-hidden="true">·</span>
                    <span>{shot.cameraAngle}</span>
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-semibold text-slate-50">
                    {shot.shotTitle}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => void copyText(shot.id, shot.prompt)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedId === shot.id ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copied Prompt</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy Prompt</span>
                    </>
                  )}
                </button>
              </div>

              {/* Prompt & Technical Metadata Split */}
              <div className="mt-4 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor={`prompt_${shot.id}`}
                      className="block text-xs font-semibold text-slate-300 mb-1.5"
                    >
                      English Image Generation Prompt (Editable)
                    </label>
                    <textarea
                      id={`prompt_${shot.id}`}
                      rows={5}
                      value={shot.prompt}
                      onChange={(e) => onUpdateShotPrompt(shot.id, e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-[#0B0F17] p-3.5 text-sm leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Telugu-English Director Explanation */}
                  <div className="rounded-lg border border-slate-800/80 bg-[#0B0F17] p-3.5">
                    <p className="text-xs font-semibold text-blue-300 mb-1">
                      Telugu-English Shot Guide
                    </p>
                    <p className="text-sm leading-relaxed text-slate-300">
                      {shot.teluguEnglishExplanation}
                    </p>
                  </div>
                </div>

                {/* Right Column: IDs, Spatial Anchor & Assigned Reference Thumbnails */}
                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border border-slate-800/80 bg-[#0B0F17] p-3.5 space-y-2">
                    <p className="font-semibold text-slate-200">Spatial &amp; Technical Spec</p>
                    <p className="text-slate-300">
                      <span className="text-slate-500">Composition:</span> {shot.composition}
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-500">Lighting:</span> {shot.lighting}
                    </p>
                    <p className="text-slate-300">
                      <span className="text-slate-500">World-Space Lock:</span>{' '}
                      {shot.worldSpaceAnchorNote}
                    </p>
                  </div>

                  {/* Entity IDs */}
                  <div className="rounded-lg border border-slate-800/80 bg-[#0B0F17] p-3.5 space-y-1.5 font-mono text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-500">Characters:</span>{' '}
                      {shot.characterIds.join(', ') || 'None'}
                    </div>
                    <div>
                      <span className="text-slate-500">Locations:</span>{' '}
                      {shot.locationIds.join(', ') || 'None'}
                    </div>
                    <div>
                      <span className="text-slate-500">Props:</span>{' '}
                      {shot.propIds.join(', ') || 'None'}
                    </div>
                    <div>
                      <span className="text-slate-500">Lighting:</span>{' '}
                      {shot.lightingIds.join(', ') || 'None'}
                    </div>
                  </div>

                  {/* Assigned Reference Thumbnails */}
                  <div className="rounded-lg border border-slate-800/80 bg-[#0B0F17] p-3.5">
                    <p className="font-semibold text-slate-200 mb-2">
                      Assigned Reference Images ({assignedRefs.length})
                    </p>
                    {assignedRefs.length === 0 ? (
                      <p className="text-slate-500">
                        IDs: {shot.assignedReferenceIds.join(', ') || 'None assigned'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {assignedRefs.map((ref) => (
                          <div key={ref.id} className="space-y-1">
                            <div className="aspect-square overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                              <img
                                src={ref.dataUrl}
                                alt={ref.name}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <p className="truncate font-mono text-[10px] text-slate-400">
                              {ref.id}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
