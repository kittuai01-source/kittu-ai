import { useRef } from 'react';
import {
  X,
  Save,
  Plus,
  Trash2,
  Download,
  Upload,
  Sparkles,
  FolderOpen,
} from 'lucide-react';
import type { SceneProject } from '../types.ts';

interface ProjectsModalProps {
  isOpen: boolean;
  currentProject: SceneProject;
  savedProjects: SceneProject[];
  onClose: () => void;
  onRenameCurrent: (name: string) => void;
  onSaveCurrent: () => Promise<void>;
  onOpenProject: (project: SceneProject) => void;
  onDeleteProject: (id: string) => Promise<void>;
  onNewProject: () => void;
  onLoadSample: () => void;
  onImportProject: (project: SceneProject) => void;
}

export function ProjectsModal({
  isOpen,
  currentProject,
  savedProjects,
  onClose,
  onRenameCurrent,
  onSaveCurrent,
  onOpenProject,
  onDeleteProject,
  onNewProject,
  onLoadSample,
  onImportProject,
}: ProjectsModalProps) {
  const importRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const exportProjectFile = () => {
    const slug = currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const blob = new Blob([JSON.stringify(currentProject, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'project'}.kittu.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SceneProject;
      if (parsed && parsed.id && Array.isArray(parsed.references)) {
        onImportProject(parsed);
        onClose();
      }
    } catch {
      // Ignore malformed file
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Project Manager"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-800 bg-[#10151F]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-slate-50">
            Projects &amp; Workspace Files
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close projects dialog"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Current Project Actions */}
          <div className="rounded-xl border border-slate-800 bg-[#0B0F17] p-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-400">Current Project Name</span>
              <input
                type="text"
                value={currentProject.name}
                onChange={(e) => onRenameCurrent(e.target.value)}
                className="w-full min-h-[42px] rounded-lg border border-slate-800 bg-[#10151F] px-3 text-sm font-medium text-slate-100 focus:border-blue-500 focus:outline-none"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onSaveCurrent()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save Project</span>
              </button>

              <button
                type="button"
                onClick={exportProjectFile}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#10151F] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                <span>Download .kittu.json</span>
              </button>

              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void handleImportFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#10151F] px-3.5 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                <span>Import File</span>
              </button>
            </div>
          </div>

          {/* Starter Templates */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onNewProject();
                onClose();
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-700 bg-[#0B0F17] px-4 py-2 text-xs font-medium text-slate-200 hover:border-blue-500/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
              <span>New Blank Scene</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onLoadSample();
                onClose();
              }}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Load Sample: Midnight Chai Cafe</span>
            </button>
          </div>

          {/* Saved Browser Projects */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-400">
              Saved Projects ({savedProjects.length})
            </h3>
            {savedProjects.length === 0 ? (
              <p className="rounded-xl border border-slate-800/70 bg-[#0B0F17] p-4 text-xs text-slate-500">
                No projects saved in browser storage yet. Click &ldquo;Save Project&rdquo; above to keep your work across sessions.
              </p>
            ) : (
              <div className="space-y-2">
                {savedProjects.map((proj) => {
                  const isCurrent = proj.id === currentProject.id;
                  return (
                    <div
                      key={proj.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0B0F17] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {proj.name}
                          {isCurrent && (
                            <span className="ml-2 text-xs font-normal text-blue-400">
                              (Active)
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                          {proj.references.length} refs · {proj.shots.length} shots · Updated{' '}
                          {new Date(proj.updatedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenProject(proj);
                              onClose();
                            }}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-blue-600 transition-colors"
                          >
                            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Open</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void onDeleteProject(proj.id)}
                          aria-label={`Delete ${proj.name}`}
                          className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:border-red-500/40 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
