import { useState } from 'react';
import {
  Sparkles,
  BrainCircuit,
  Lock,
  SlidersHorizontal,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import type {
  CameraRig,
  CategoryLocks,
  ConsistencyMode,
  GeneratedShot,
  ReferenceItem,
  SceneAnalysis,
  SpatialObject,
} from '../types.ts';
import { formatCameraSpatialBrief } from '../utils/spatialMath.ts';

interface SceneScriptPanelProps {
  sceneDescription: string;
  consistencyMode: ConsistencyMode;
  categoryLocks: CategoryLocks;
  shotCountMode: 'auto' | 'manual';
  manualShotCount: number;
  sceneAnalysis: SceneAnalysis | null;
  references: ReferenceItem[];
  spatialObjects: SpatialObject[];
  layoutConfirmed: boolean;
  cameras: CameraRig[];
  onChangeSceneDescription: (val: string) => void;
  onChangeConsistencyMode: (mode: ConsistencyMode) => void;
  onChangeCategoryLocks: (locks: CategoryLocks) => void;
  onChangeShotCountMode: (mode: 'auto' | 'manual') => void;
  onChangeManualShotCount: (count: number) => void;
  onSetSceneAnalysis: (analysis: SceneAnalysis) => void;
  onSetShots: (shots: GeneratedShot[]) => void;
  onNavigateToShots: () => void;
}

const SAMPLE_TELUGU =
  'వర్షం పడుతున్న రాత్రి, అర్జున్ తలుపు తెరిచి కేఫ్‌లోకి వస్తాడు. ఎడమ వైపు అద్దం కిటికీ బయట నీలి వీధి దీపాలు కనిపిస్తాయి. అతను మధ్య టేబుల్ దగ్గర కూర్చుని పాత తోలు డైరీని తెరుస్తాడు.';

const SAMPLE_ENGLISH =
  'On a rainy midnight, Arjun steps through the back cafe door into warm pendant light while blue streetlamps glow outside the left glass window. He sits at the center walnut table, takes out his worn leather diary beside a steaming chai glass, and pauses in deep thought.';

export function SceneScriptPanel({
  sceneDescription,
  consistencyMode,
  categoryLocks,
  shotCountMode,
  manualShotCount,
  sceneAnalysis,
  references,
  spatialObjects,
  layoutConfirmed,
  cameras,
  onChangeSceneDescription,
  onChangeConsistencyMode,
  onChangeCategoryLocks,
  onChangeShotCountMode,
  onChangeManualShotCount,
  onSetSceneAnalysis,
  onSetShots,
  onNavigateToShots,
}: SceneScriptPanelProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSceneAnalysis = async (): Promise<SceneAnalysis | null> => {
    if (!sceneDescription.trim()) {
      setError('Enter a scene description in Telugu or English first.');
      return null;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneDescription,
          references: references.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            visionSummary: r.visionSummary,
          })),
          shotCountMode,
          manualShotCount,
        }),
      });
      const data = (await res.json()) as SceneAnalysis & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Scene analysis failed.');
      }
      onSetSceneAnalysis(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze scene');
      return null;
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateShots = async () => {
    if (!sceneDescription.trim()) {
      setError('Enter a scene description in Telugu or English first.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      let currentAnalysis = sceneAnalysis;
      if (!currentAnalysis) {
        currentAnalysis = await runSceneAnalysis();
      }

      const targetShotCount =
        shotCountMode === 'manual'
          ? manualShotCount
          : Math.max(2, Math.min(12, currentAnalysis?.recommendedShotCount || 4));

      const cameraBriefs = cameras.map((cam) =>
        formatCameraSpatialBrief(cam, spatialObjects)
      );

      const res = await fetch('/api/generate-shots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneDescription,
          sceneAnalysis: currentAnalysis,
          references: references.map((r) => ({
            id: r.id,
            name: r.name,
            category: r.category,
            visionSummary: r.visionSummary,
            extractedDetails: r.extractedDetails,
          })),
          spatialObjects,
          layoutConfirmed,
          cameras,
          cameraBriefs,
          consistencyMode,
          categoryLocks,
          targetShotCount,
        }),
      });

      const data = (await res.json()) as { shots?: GeneratedShot[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate shots.');
      }
      onSetShots(data.shots || []);
      onNavigateToShots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shot generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-50">
            03. Scene Script &amp; Consistency Controls
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Write your scene in Telugu, English, or mixed Telugu-English. Configure lock rules and generate shot prompts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeSceneDescription(SAMPLE_TELUGU)}
            className="min-h-[36px] rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-white transition-colors whitespace-nowrap"
          >
            Telugu Sample
          </button>
          <button
            type="button"
            onClick={() => onChangeSceneDescription(SAMPLE_ENGLISH)}
            className="min-h-[36px] rounded-lg border border-slate-800 bg-[#0B0F17] px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-white transition-colors whitespace-nowrap"
          >
            English Sample
          </button>
        </div>
      </div>

      {/* Scene Textarea */}
      <div className="mt-4">
        <textarea
          rows={5}
          value={sceneDescription}
          onChange={(e) => onChangeSceneDescription(e.target.value)}
          placeholder="Describe your scene in Telugu (తెలుగు), English, or Telugu-English..."
          className="w-full rounded-xl border border-slate-800 bg-[#0B0F17] p-4 text-sm leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Consistency Modes & Shot Count Controls */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {/* Consistency Mode */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0B0F17] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Lock className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
              Consistency Mode
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-[#10151F] p-1">
            <button
              type="button"
              onClick={() => onChangeConsistencyMode('strict')}
              className={`min-h-[38px] rounded-md px-3 text-xs font-medium transition-colors ${
                consistencyMode === 'strict'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Strict Lock
            </button>
            <button
              type="button"
              onClick={() => onChangeConsistencyMode('flexible')}
              className={`min-h-[38px] rounded-md px-3 text-xs font-medium transition-colors ${
                consistencyMode === 'flexible'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Flexible Locks
            </button>
          </div>

          {consistencyMode === 'strict' ? (
            <p className="text-xs text-slate-400">
              All uploaded references (Character, Background, Prop, Lighting) and confirmed spatial coordinates remain strictly locked across every shot.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {(['character', 'background', 'prop', 'lighting'] as const).map((cat) => (
                <label
                  key={cat}
                  className="flex min-h-[38px] cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-[#10151F] px-3 text-xs text-slate-200"
                >
                  <span className="capitalize">{cat}</span>
                  <input
                    type="checkbox"
                    checked={categoryLocks[cat]}
                    onChange={(e) =>
                      onChangeCategoryLocks({
                        ...categoryLocks,
                        [cat]: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-blue-500"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Shot Count Mode */}
        <div className="rounded-xl border border-slate-800/80 bg-[#0B0F17] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
              Shot Breakdown Pacing
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-[#10151F] p-1">
            <button
              type="button"
              onClick={() => onChangeShotCountMode('auto')}
              className={`min-h-[38px] rounded-md px-3 text-xs font-medium transition-colors ${
                shotCountMode === 'auto'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Auto (AI Decides)
            </button>
            <button
              type="button"
              onClick={() => onChangeShotCountMode('manual')}
              className={`min-h-[38px] rounded-md px-3 text-xs font-medium transition-colors ${
                shotCountMode === 'manual'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Manual Override
            </button>
          </div>

          {shotCountMode === 'auto' ? (
            <p className="text-xs text-slate-400">
              Gemini analyzes emotional beats, movement, and camera positions to choose an optimal shot count
              {sceneAnalysis ? ` (recommended: ${sceneAnalysis.recommendedShotCount} shots)` : ''}.
            </p>
          ) : (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Target Shot Count</span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {manualShotCount} shots
                </span>
              </div>
              <input
                type="range"
                min={2}
                max={12}
                value={manualShotCount}
                onChange={(e) => onChangeManualShotCount(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => void runSceneAnalysis()}
          disabled={analyzing || generating}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-700 bg-[#151D2C] px-4 py-2.5 text-sm font-medium text-slate-100 hover:border-blue-500/60 disabled:opacity-50 transition-colors"
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" aria-hidden="true" />
          ) : (
            <BrainCircuit className="h-4 w-4 text-blue-400" aria-hidden="true" />
          )}
          <span>{analyzing ? 'Analyzing Scene...' : 'Analyze Scene Only'}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleGenerateShots()}
          disabled={generating || analyzing}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{generating ? 'Generating Locked Shots...' : 'Generate Shot Prompts'}</span>
          {!generating && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      {/* Scene Analysis Output Card */}
      {sceneAnalysis && (
        <div className="mt-6 space-y-4 border-t border-slate-800/80 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Scene Analysis Breakdown</span>
            <span className="font-mono tabular-nums">
              Language: {sceneAnalysis.languageDetected} · Recommended: {sceneAnalysis.recommendedShotCount} shots
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-800/70 bg-[#0B0F17] p-3.5 text-xs leading-relaxed text-slate-300">
              <p className="font-semibold text-slate-200 mb-1">English Director Summary</p>
              <p>{sceneAnalysis.summaryEnglish}</p>
            </div>
            <div className="rounded-lg border border-slate-800/70 bg-[#0B0F17] p-3.5 text-xs leading-relaxed text-slate-300">
              <p className="font-semibold text-blue-300 mb-1">Telugu-English Summary</p>
              <p>{sceneAnalysis.summaryTeluguEnglish}</p>
            </div>
          </div>

          {sceneAnalysis.continuityAnchors.length > 0 && (
            <div className="rounded-lg border border-slate-800/70 bg-[#0B0F17] p-3.5 text-xs text-slate-300">
              <p className="font-semibold text-slate-200 mb-1.5">Continuity Anchors</p>
              <ul className="space-y-1 text-slate-400">
                {sceneAnalysis.continuityAnchors.map((anchor, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-blue-400">·</span>
                    <span>{anchor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
