import { FolderOpen, Layers, Compass, Film, ShieldCheck } from 'lucide-react';
import type { WorkspaceTab } from '../types.ts';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  projectName: string;
  onOpenProjects: () => void;
  shotCount: number;
  refCount: number;
  layoutConfirmed: boolean;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string; icon: typeof Layers }> = [
  { id: 'studio', label: 'Studio', icon: Layers },
  { id: 'spatial', label: 'Spatial Lock', icon: Compass },
  { id: 'shots', label: 'Shots', icon: Film },
  { id: 'validator', label: 'Validator', icon: ShieldCheck },
];

export function TopBar({
  activeTab,
  onSelectTab,
  projectName,
  onOpenProjects,
  shotCount,
  refCount,
  layoutConfirmed,
}: TopBarProps) {
  return (
    <>
      {/* Desktop & Mobile Top Header — 3-Zone Contract */}
      <header className="sticky top-0 z-30 h-14 sm:h-16 border-b border-slate-800/90 bg-[#090C12]/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-6 sm:gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-element wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('studio')}
            className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            KITTU <span className="text-blue-400">AI</span>
          </button>

          {/* Zone 2: Clean single-line text nav links (Desktop / Tablet) */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`relative py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${
                    isActive
                      ? 'text-blue-400'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {item.label}
                  {item.id === 'shots' && shotCount > 0 && (
                    <span className="ml-1.5 font-mono text-xs text-slate-500 tabular-nums">
                      ({shotCount})
                    </span>
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-blue-500"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenProjects}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-700/80 bg-[#111723] px-3.5 py-2 text-xs font-medium text-slate-100 hover:border-blue-500/60 hover:bg-[#151E2E] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title={`Manage project: ${projectName} (${refCount} refs, ${
                layoutConfirmed ? 'Locked' : 'Draft'
              })`}
            >
              <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" aria-hidden="true" />
              <span className="max-w-[120px] sm:max-w-[180px] truncate">{projectName}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Navigation (Natural Thumb Zone, compact <= 58px) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-[#0B0F17]/95 backdrop-blur-md md:hidden pb-safe"
      >
        <div className="grid grid-cols-4 h-14">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-[11px] font-medium whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
