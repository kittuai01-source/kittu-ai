import { useEffect, useState } from 'react';
import { Lock, Unlock, Plus, Sparkles, Compass, Save } from 'lucide-react';
import type {
  CameraRig,
  CategoryLocks,
  ConsistencyMode,
  GeneratedShot,
  ReferenceItem,
  SceneAnalysis,
  SceneProject,
  SpatialObject,
  ValidationReport,
  WorkspaceTab,
} from './types.ts';
import { createEmptyProject, createSampleProject } from './data/sampleProject.ts';
import {
  deleteProjectFromDb,
  getLastActiveProjectId,
  listProjectsFromDb,
  loadProjectFromDb,
  saveProjectToDb,
} from './utils/projectStorage.ts';
import { TopBar } from './components/TopBar.tsx';
import { ReferenceLibrary } from './components/ReferenceLibrary.tsx';
import { SpatialFloorPlan } from './components/SpatialFloorPlan.tsx';
import { SceneScriptPanel } from './components/SceneScriptPanel.tsx';
import { ShotListView } from './components/ShotListView.tsx';
import { ContinuityValidator } from './components/ContinuityValidator.tsx';
import { ProjectsModal } from './components/ProjectsModal.tsx';

export default function App() {
  const [project, setProject] = useState<SceneProject>(() => createSampleProject());
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SceneProject[]>([]);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate last active project from IndexedDB if available
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await listProjectsFromDb();
        if (!active) return;
        setSavedProjects(list);
        const lastId = getLastActiveProjectId();
        if (lastId) {
          const found = await loadProjectFromDb(lastId);
          if (found && active) {
            setProject(found);
          }
        }
      } catch {
        // IndexedDB unavailable in private sandbox; keep in-memory state
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Debounced auto-save after hydration
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveProjectToDb(project)
        .then(() => listProjectsFromDb())
        .then((list) => setSavedProjects(list))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [project, hydrated]);

  const updateProject = (updater: (prev: SceneProject) => SceneProject) => {
    setProject((prev) => ({
      ...updater(prev),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleManualSave = async () => {
    await saveProjectToDb(project);
    const list = await listProjectsFromDb();
    setSavedProjects(list);
    setSaveNotice('Saved');
    setTimeout(() => setSaveNotice(null), 1800);
  };

  const handleAddReferences = (items: ReferenceItem[]) => {
    updateProject((prev) => ({
      ...prev,
      references: [...prev.references, ...items],
    }));
  };

  const handleUpdateReference = (id: string, patch: Partial<ReferenceItem>) => {
    updateProject((prev) => ({
      ...prev,
      references: prev.references.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const handleRemoveReference = (id: string) => {
    updateProject((prev) => ({
      ...prev,
      references: prev.references.filter((r) => r.id !== id),
    }));
  };

  const handleSetSpatialObjects = (objects: SpatialObject[]) => {
    updateProject((prev) => {
      // Enforce immutability if layout is already confirmed
      if (prev.layoutConfirmed) return prev;
      return { ...prev, spatialObjects: objects };
    });
  };

  const handleChangeRoomSize = (roomWidth: number, roomDepth: number) => {
    updateProject((prev) => {
      if (prev.layoutConfirmed) return prev;
      return {
        ...prev,
        roomWidth: Math.max(4, Math.min(30, roomWidth)),
        roomDepth: Math.max(4, Math.min(30, roomDepth)),
      };
    });
  };

  const handleToggleLayoutConfirmed = (layoutConfirmed: boolean) => {
    updateProject((prev) => ({ ...prev, layoutConfirmed }));
  };

  const handleSetCameras = (cameras: CameraRig[]) => {
    // Camera mapping updates NEVER alter confirmed spatialObjects
    updateProject((prev) => ({ ...prev, cameras }));
  };

  const handleUpdateShotPrompt = (shotId: string, prompt: string) => {
    updateProject((prev) => ({
      ...prev,
      shots: prev.shots.map((s) => (s.id === shotId ? { ...s, prompt } : s)),
    }));
  };

  const handleAttachShotImage = (shotId: string, dataUrl: string) => {
    updateProject((prev) => ({
      ...prev,
      shots: prev.shots.map((s) =>
        s.id === shotId ? { ...s, uploadedResultDataUrl: dataUrl } : s
      ),
    }));
  };

  const handleAddValidationReport = (report: ValidationReport) => {
    updateProject((prev) => ({
      ...prev,
      validationReports: [report, ...prev.validationReports],
    }));
  };

  return (
    <div className="min-h-screen bg-[#090C12] text-slate-100 pb-20 md:pb-12">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        projectName={project.name}
        onOpenProjects={() => setProjectsOpen(true)}
        shotCount={project.shots.length}
        refCount={project.references.length}
        layoutConfirmed={project.layoutConfirmed}
      />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 space-y-6">
        {/* Workspace Context & Quick Controls Strip (below TopBar) */}
        <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-wider text-slate-50 text-balance">
              KITTU <span className="text-blue-400">AI</span>
            </h1>
            <p className="mt-2 text-sm sm:text-base font-medium text-slate-200">
              {project.name}
            </p>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 tabular-nums">
              {project.references.length} references · {project.spatialObjects.length} world objects ·{' '}
              {project.cameras.length} cameras ·{' '}
              <span className={project.layoutConfirmed ? 'text-emerald-400' : 'text-amber-400'}>
                {project.layoutConfirmed ? 'Spatial Lock Confirmed' : 'Draft Floor Plan'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleManualSave()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-800 bg-[#10151F] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
              <span>{saveNotice || 'Save Project'}</span>
            </button>

            <button
              type="button"
              onClick={() => setProject(createEmptyProject('New Scene'))}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-800 bg-[#10151F] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Scene</span>
            </button>

            <button
              type="button"
              onClick={() => setProject(createSampleProject())}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20 transition-colors whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Load Sample Scene</span>
            </button>
          </div>
        </div>

        {/* Active Workspace View */}
        {activeTab === 'studio' && (
          <div className="space-y-6">
            <ReferenceLibrary
              references={project.references}
              onAddReferences={handleAddReferences}
              onUpdateReference={handleUpdateReference}
              onRemoveReference={handleRemoveReference}
            />

            {/* Compact Spatial Lock Summary Callout linking to 2D Floor Plan */}
            <section className="flex flex-col gap-4 rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {project.layoutConfirmed ? (
                    <Lock className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Unlock className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
                  )}
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    02. Hybrid Spatial Lock &amp; Multi-Camera Setup
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 tabular-nums">
                  {project.spatialObjects.length} objects mapped in {project.roomWidth}m ×{' '}
                  {project.roomDepth}m space · {project.cameras.length} cameras configured (
                  {project.cameras.map((c) => `${c.id} ${c.focalLength}mm`).join(', ')})
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('spatial')}
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors whitespace-nowrap shrink-0"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                <span>Open 2D Floor Plan</span>
              </button>
            </section>

            <SceneScriptPanel
              sceneDescription={project.sceneDescription}
              consistencyMode={project.consistencyMode}
              categoryLocks={project.categoryLocks}
              shotCountMode={project.shotCountMode}
              manualShotCount={project.manualShotCount}
              sceneAnalysis={project.sceneAnalysis}
              references={project.references}
              spatialObjects={project.spatialObjects}
              layoutConfirmed={project.layoutConfirmed}
              cameras={project.cameras}
              onChangeSceneDescription={(sceneDescription) =>
                updateProject((prev) => ({ ...prev, sceneDescription }))
              }
              onChangeConsistencyMode={(consistencyMode: ConsistencyMode) =>
                updateProject((prev) => ({ ...prev, consistencyMode }))
              }
              onChangeCategoryLocks={(categoryLocks: CategoryLocks) =>
                updateProject((prev) => ({ ...prev, categoryLocks }))
              }
              onChangeShotCountMode={(shotCountMode) =>
                updateProject((prev) => ({ ...prev, shotCountMode }))
              }
              onChangeManualShotCount={(manualShotCount) =>
                updateProject((prev) => ({ ...prev, manualShotCount }))
              }
              onSetSceneAnalysis={(sceneAnalysis: SceneAnalysis) =>
                updateProject((prev) => ({ ...prev, sceneAnalysis }))
              }
              onSetShots={(shots: GeneratedShot[]) =>
                updateProject((prev) => ({ ...prev, shots }))
              }
              onNavigateToShots={() => setActiveTab('shots')}
            />
          </div>
        )}

        {activeTab === 'spatial' && (
          <SpatialFloorPlan
            roomWidth={project.roomWidth}
            roomDepth={project.roomDepth}
            references={project.references}
            spatialObjects={project.spatialObjects}
            layoutConfirmed={project.layoutConfirmed}
            cameras={project.cameras}
            onChangeRoomSize={handleChangeRoomSize}
            onSetSpatialObjects={handleSetSpatialObjects}
            onToggleLayoutConfirmed={handleToggleLayoutConfirmed}
            onSetCameras={handleSetCameras}
          />
        )}

        {activeTab === 'shots' && (
          <ShotListView
            projectName={project.name}
            shots={project.shots}
            references={project.references}
            cameras={project.cameras}
            onUpdateShotPrompt={handleUpdateShotPrompt}
            onBackToStudio={() => setActiveTab('studio')}
            onGoToValidator={() => setActiveTab('validator')}
          />
        )}

        {activeTab === 'validator' && (
          <ContinuityValidator
            shots={project.shots}
            references={project.references}
            spatialObjects={project.spatialObjects}
            cameras={project.cameras}
            consistencyMode={project.consistencyMode}
            categoryLocks={project.categoryLocks}
            validationReports={project.validationReports}
            onAttachShotImage={handleAttachShotImage}
            onAddValidationReport={handleAddValidationReport}
          />
        )}
      </main>

      <ProjectsModal
        isOpen={projectsOpen}
        currentProject={project}
        savedProjects={savedProjects}
        onClose={() => setProjectsOpen(false)}
        onRenameCurrent={(name) => updateProject((prev) => ({ ...prev, name }))}
        onSaveCurrent={handleManualSave}
        onOpenProject={(proj) => setProject(proj)}
        onDeleteProject={async (id) => {
          await deleteProjectFromDb(id);
          const list = await listProjectsFromDb();
          setSavedProjects(list);
        }}
        onNewProject={() => setProject(createEmptyProject('New Scene'))}
        onLoadSample={() => setProject(createSampleProject())}
        onImportProject={(proj) => setProject(proj)}
      />
    </div>
  );
}
