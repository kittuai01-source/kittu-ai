import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Lock,
  Unlock,
  Plus,
  Camera,
  Trash2,
  ScanSearch,
  Loader2,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import type {
  CameraHeightLabel,
  CameraRig,
  ReferenceItem,
  SpatialObject,
  SpatialObjectType,
} from '../types.ts';
import {
  computeCameraPerspective,
  focalLengthToFovDeg,
  normalizeAngleDeg,
} from '../utils/spatialMath.ts';
import { urlToCompressedDataUrl } from '../utils/imageHelpers.ts';

interface SpatialFloorPlanProps {
  roomWidth: number;
  roomDepth: number;
  references: ReferenceItem[];
  spatialObjects: SpatialObject[];
  layoutConfirmed: boolean;
  cameras: CameraRig[];
  onChangeRoomSize: (width: number, depth: number) => void;
  onSetSpatialObjects: (objects: SpatialObject[]) => void;
  onToggleLayoutConfirmed: (confirmed: boolean) => void;
  onSetCameras: (cameras: CameraRig[]) => void;
}

const OBJECT_TYPES: Array<{ type: SpatialObjectType; label: string; color: string }> = [
  { type: 'wall', label: 'Wall', color: '#475569' },
  { type: 'window', label: 'Window', color: '#38BDF8' },
  { type: 'door', label: 'Door', color: '#F59E0B' },
  { type: 'furniture', label: 'Furniture', color: '#818CF8' },
  { type: 'prop', label: 'Prop', color: '#34D399' },
  { type: 'character', label: 'Character', color: '#F472B6' },
];

const FOCAL_PRESETS = [18, 24, 35, 50, 85, 135];
const CAMERA_COLORS = ['#3B82F6', '#38BDF8', '#60A5FA', '#A78BFA', '#2DD4BF'];

function getObjectColor(type: SpatialObjectType): string {
  return OBJECT_TYPES.find((t) => t.type === type)?.color || '#64748B';
}

export function SpatialFloorPlan({
  roomWidth,
  roomDepth,
  references,
  spatialObjects,
  layoutConfirmed,
  cameras,
  onChangeRoomSize,
  onSetSpatialObjects,
  onToggleLayoutConfirmed,
  onSetCameras,
}: SpatialFloorPlanProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(
    spatialObjects[0]?.id ?? null
  );
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameras[0]?.id ?? '');
  const [inspectorMode, setInspectorMode] = useState<'camera' | 'object'>('camera');
  const [dragState, setDragState] = useState<
    | { kind: 'object'; id: string }
    | { kind: 'camera'; id: string }
    | { kind: 'camera-aim'; id: string }
    | null
  >(null);

  const bgReferences = references.filter((r) => r.category === 'background');
  const [detectSourceId, setDetectSourceId] = useState<string>(bgReferences[0]?.id ?? '');
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectNote, setDetectNote] = useState<string | null>(null);

  const selectedObject = spatialObjects.find((o) => o.id === selectedObjectId) ?? null;
  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) ?? cameras[0] ?? null;

  const cameraPerspective = useMemo(() => {
    if (!selectedCamera) return [];
    return computeCameraPerspective(selectedCamera, spatialObjects);
  }, [selectedCamera, spatialObjects]);

  // SVG viewBox maps directly to meters * 100 for crisp precision
  const scale = 100;
  const vbWidth = roomWidth * scale;
  const vbHeight = roomDepth * scale;

  const clientToWorld = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: roomWidth / 2, y: roomDepth / 2 };
    const rect = svg.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return {
      x: Number((normX * roomWidth).toFixed(2)),
      y: Number((normY * roomDepth).toFixed(2)),
    };
  };

  const handleSvgPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const world = clientToWorld(e.clientX, e.clientY);

    if (dragState.kind === 'object') {
      if (layoutConfirmed) return;
      onSetSpatialObjects(
        spatialObjects.map((obj) =>
          obj.id === dragState.id ? { ...obj, x: world.x, y: world.y } : obj
        )
      );
    } else if (dragState.kind === 'camera') {
      onSetCameras(
        cameras.map((cam) =>
          cam.id === dragState.id ? { ...cam, x: world.x, y: world.y } : cam
        )
      );
    } else if (dragState.kind === 'camera-aim') {
      const cam = cameras.find((c) => c.id === dragState.id);
      if (!cam) return;
      const dx = world.x - cam.x;
      const dy = world.y - cam.y;
      const angle = Math.round(normalizeAngleDeg((Math.atan2(dx, -dy) * 180) / Math.PI));
      onSetCameras(
        cameras.map((c) => (c.id === dragState.id ? { ...c, angle } : c))
      );
    }
  };

  const stopDragging = () => {
    setDragState(null);
  };

  const handleAddObject = (type: SpatialObjectType) => {
    if (layoutConfirmed) return;
    const count = spatialObjects.filter((o) => o.type === type).length + 1;
    const defaults: Record<SpatialObjectType, { w: number; d: number; label: string }> = {
      wall: { w: 4, d: 0.25, label: `Wall ${count}` },
      window: { w: 2.2, d: 0.25, label: `Window ${count}` },
      door: { w: 1.0, d: 0.3, label: `Door ${count}` },
      furniture: { w: 1.6, d: 1.1, label: `Furniture ${count}` },
      prop: { w: 0.6, d: 0.45, label: `Prop ${count}` },
      character: { w: 0.6, d: 0.6, label: `Character ${count}` },
    };
    const cfg = defaults[type];
    const newObj: SpatialObject = {
      id: `OBJ_${type.toUpperCase()}_${Date.now().toString().slice(-4)}`,
      label: cfg.label,
      type,
      x: Number((roomWidth / 2).toFixed(2)),
      y: Number((roomDepth / 2).toFixed(2)),
      width: cfg.w,
      depth: cfg.d,
      rotation: 0,
    };
    onSetSpatialObjects([...spatialObjects, newObj]);
    setSelectedObjectId(newObj.id);
    setInspectorMode('object');
  };

  const updateSelectedObject = (patch: Partial<SpatialObject>) => {
    if (!selectedObject || layoutConfirmed) return;
    onSetSpatialObjects(
      spatialObjects.map((o) => (o.id === selectedObject.id ? { ...o, ...patch } : o))
    );
  };

  const deleteSelectedObject = () => {
    if (!selectedObject || layoutConfirmed) return;
    const remaining = spatialObjects.filter((o) => o.id !== selectedObject.id);
    onSetSpatialObjects(remaining);
    setSelectedObjectId(remaining[0]?.id ?? null);
  };

  const handleAddCamera = () => {
    const idx = cameras.length;
    const letter = String.fromCharCode(65 + (idx % 26));
    const newCam: CameraRig = {
      id: `CAM_${letter}_${idx + 1}`,
      name: `Camera ${letter}`,
      x: Number((roomWidth * 0.5).toFixed(2)),
      y: Number((roomDepth * 0.78).toFixed(2)),
      angle: 0,
      focalLength: 35,
      heightLabel: 'Eye Level',
      color: CAMERA_COLORS[idx % CAMERA_COLORS.length],
    };
    onSetCameras([...cameras, newCam]);
    setSelectedCameraId(newCam.id);
    setInspectorMode('camera');
  };

  const updateSelectedCamera = (patch: Partial<CameraRig>) => {
    if (!selectedCamera) return;
    onSetCameras(
      cameras.map((c) => (c.id === selectedCamera.id ? { ...c, ...patch } : c))
    );
  };

  const deleteSelectedCamera = () => {
    if (!selectedCamera || cameras.length <= 1) return;
    const remaining = cameras.filter((c) => c.id !== selectedCamera.id);
    onSetCameras(remaining);
    setSelectedCameraId(remaining[0]?.id ?? '');
  };

  const handleDetectFromBackground = async () => {
    const targetId = detectSourceId || bgReferences[0]?.id;
    const ref = references.find((r) => r.id === targetId);
    if (!ref) {
      setDetectError('Upload a Background reference image first to detect layout.');
      return;
    }
    if (layoutConfirmed) {
      setDetectError('Unlock the confirmed floor plan before overwriting objects.');
      return;
    }
    setDetecting(true);
    setDetectError(null);
    setDetectNote(null);
    try {
      const prepared = ref.dataUrl.startsWith('data:')
        ? ref.dataUrl
        : (await urlToCompressedDataUrl(ref.dataUrl)).dataUrl;
      const res = await fetch('/api/detect-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: prepared,
          roomWidth,
          roomDepth,
          referenceId: ref.id,
        }),
      });
      const data = (await res.json()) as {
        objects?: SpatialObject[];
        notes?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Layout detection failed.');
      }
      if (data.objects && data.objects.length > 0) {
        onSetSpatialObjects(data.objects);
        setSelectedObjectId(data.objects[0].id);
        setInspectorMode('object');
      }
      setDetectNote(data.notes || 'Detected architectural and furniture positions.');
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : 'Failed to detect layout');
    } finally {
      setDetecting(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800/90 bg-[#10151F] p-4 sm:p-6">
      {/* Header & Spatial Lock Action */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-50">
            02. Hybrid Spatial Lock &amp; Camera Mapping
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Fix walls, doors, furniture, and props in shared world space. Move cameras freely without shifting room geometry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {bgReferences.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                aria-label="Background reference for layout detection"
                value={detectSourceId || bgReferences[0]?.id || ''}
                onChange={(e) => setDetectSourceId(e.target.value)}
                disabled={layoutConfirmed || detecting}
                className="min-h-[40px] rounded-lg border border-slate-700 bg-[#0B0F17] px-3 text-xs text-slate-200 disabled:opacity-50 focus:border-blue-500 focus:outline-none"
              >
                {bgReferences.map((bg) => (
                  <option key={bg.id} value={bg.id}>
                    {bg.id} · {bg.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleDetectFromBackground()}
                disabled={layoutConfirmed || detecting}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-[#151D2C] px-3.5 py-2 text-xs font-medium text-slate-100 hover:border-blue-500/60 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {detecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" aria-hidden="true" />
                ) : (
                  <ScanSearch className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                )}
                <span>Detect Layout</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onToggleLayoutConfirmed(!layoutConfirmed)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              layoutConfirmed
                ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {layoutConfirmed ? (
              <>
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Layout Locked · Unlock</span>
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Confirm Spatial Lock</span>
              </>
            )}
          </button>
        </div>
      </div>

      {detectError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
          <span>{detectError}</span>
        </div>
      )}
      {detectNote && (
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
          {detectNote}
        </div>
      )}

      {/* Main Split: 2D Top-View Floor Plan Canvas + Inspector */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[1.35fr_1fr] items-start">
        {/* Left: Interactive 2D Floor Plan */}
        <div className="space-y-3">
          {/* Quick Add Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {OBJECT_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  disabled={layoutConfirmed}
                  onClick={() => handleAddObject(item.type)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  <Plus className="h-3 w-3 text-slate-400" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddCamera}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/25 transition-colors whitespace-nowrap"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Camera</span>
            </button>
          </div>

          {/* Floor Plan SVG Viewport */}
          <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-[#070A0F]">
            <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2 text-xs text-slate-400">
              <span className="font-mono tabular-nums">
                World Space: {roomWidth}m × {roomDepth}m
              </span>
              <span>
                {layoutConfirmed
                  ? 'Geometry locked · Drag cameras freely'
                  : 'Drag objects or cameras on plan'}
              </span>
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${vbWidth} ${vbHeight}`}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onPointerLeave={stopDragging}
              className="block w-full touch-none select-none"
              style={{ aspectRatio: `${roomWidth} / ${roomDepth}` }}
            >
              <defs>
                <pattern
                  id="grid1m"
                  width={scale}
                  height={scale}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${scale} 0 L 0 0 0 ${scale}`}
                    fill="none"
                    stroke="#1E293B"
                    strokeOpacity="0.45"
                    strokeWidth="1.5"
                  />
                </pattern>
              </defs>

              <rect width={vbWidth} height={vbHeight} fill="url(#grid1m)" />

              {/* Compass Direction Labels */}
              <text x={vbWidth / 2} y={24} textAnchor="middle" fill="#475569" fontSize="18" fontWeight="600">
                N (0°)
              </text>
              <text x={vbWidth / 2} y={vbHeight - 12} textAnchor="middle" fill="#475569" fontSize="18" fontWeight="600">
                S (180°)
              </text>

              {/* Camera FOV Frustums (rendered behind objects for readability) */}
              {cameras.map((cam) => {
                const fov = focalLengthToFovDeg(cam.focalLength);
                const halfRad = ((fov / 2) * Math.PI) / 180;
                const aimRad = ((cam.angle - 90) * Math.PI) / 180;
                const range = 3.8 * scale;
                const cx = cam.x * scale;
                const cy = cam.y * scale;
                const x1 = cx + Math.cos(aimRad - halfRad) * range;
                const y1 = cy + Math.sin(aimRad - halfRad) * range;
                const x2 = cx + Math.cos(aimRad + halfRad) * range;
                const y2 = cy + Math.sin(aimRad + halfRad) * range;
                const isSelected = cam.id === selectedCamera?.id;

                return (
                  <polygon
                    key={`fov_${cam.id}`}
                    points={`${cx},${cy} ${x1},${y1} ${x2},${y2}`}
                    fill={cam.color}
                    fillOpacity={isSelected ? 0.16 : 0.06}
                    stroke={cam.color}
                    strokeOpacity={isSelected ? 0.55 : 0.25}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray="6 4"
                    className="pointer-events-none"
                  />
                );
              })}

              {/* Spatial Objects */}
              {spatialObjects.map((obj) => {
                const w = obj.width * scale;
                const d = obj.depth * scale;
                const cx = obj.x * scale;
                const cy = obj.y * scale;
                const color = getObjectColor(obj.type);
                const isSelected = obj.id === selectedObject?.id && inspectorMode === 'object';

                return (
                  <g
                    key={obj.id}
                    transform={`translate(${cx}, ${cy}) rotate(${obj.rotation})`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedObjectId(obj.id);
                      setInspectorMode('object');
                      if (!layoutConfirmed) {
                        setDragState({ kind: 'object', id: obj.id });
                      }
                    }}
                    className={layoutConfirmed ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
                  >
                    {obj.type === 'character' ? (
                      <>
                        <circle
                          r={Math.max(22, w / 2)}
                          fill={color}
                          fillOpacity={0.28}
                          stroke={isSelected ? '#FFFFFF' : color}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                        {/* Facing direction notch */}
                        <line
                          x1={0}
                          y1={0}
                          x2={0}
                          y2={-Math.max(28, w / 2 + 8)}
                          stroke={color}
                          strokeWidth={3}
                        />
                      </>
                    ) : (
                      <rect
                        x={-w / 2}
                        y={-d / 2}
                        width={w}
                        height={d}
                        rx={obj.type === 'wall' ? 2 : 6}
                        fill={color}
                        fillOpacity={obj.type === 'wall' ? 0.65 : 0.25}
                        stroke={isSelected ? '#FFFFFF' : color}
                        strokeWidth={isSelected ? 3 : 2}
                      />
                    )}
                    <text
                      x={0}
                      y={obj.type === 'character' ? 42 : d / 2 + 18}
                      textAnchor="middle"
                      fill="#E2E8F0"
                      fontSize="16"
                      fontWeight="500"
                      transform={`rotate(${-obj.rotation})`}
                    >
                      {obj.label}
                    </text>
                  </g>
                );
              })}

              {/* Cameras + Aim Handles */}
              {cameras.map((cam) => {
                const cx = cam.x * scale;
                const cy = cam.y * scale;
                const isSelected = cam.id === selectedCamera?.id && inspectorMode === 'camera';
                const aimRad = ((cam.angle - 90) * Math.PI) / 180;
                const handleDist = 90;
                const hx = cx + Math.cos(aimRad) * handleDist;
                const hy = cy + Math.sin(aimRad) * handleDist;

                return (
                  <g key={cam.id}>
                    {/* Aim line + draggable aim knob for selected camera */}
                    <line
                      x1={cx}
                      y1={cy}
                      x2={hx}
                      y2={hy}
                      stroke={cam.color}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    {isSelected && (
                      <circle
                        cx={hx}
                        cy={hy}
                        r={12}
                        fill="#090C12"
                        stroke={cam.color}
                        strokeWidth={3}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDragState({ kind: 'camera-aim', id: cam.id });
                        }}
                        className="cursor-crosshair"
                      />
                    )}

                    {/* Camera Body */}
                    <g
                      transform={`translate(${cx}, ${cy})`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelectedCameraId(cam.id);
                        setInspectorMode('camera');
                        setDragState({ kind: 'camera', id: cam.id });
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <circle
                        r={20}
                        fill="#0B111E"
                        stroke={isSelected ? '#FFFFFF' : cam.color}
                        strokeWidth={isSelected ? 3.5 : 2.5}
                      />
                      <circle r={6} fill={cam.color} />
                      <text
                        y={36}
                        textAnchor="middle"
                        fill="#F8FAFC"
                        fontSize="16"
                        fontWeight="600"
                      >
                        {cam.id} ({cam.focalLength}mm)
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right: Camera & Object Inspector */}
        <div className="space-y-4">
          {/* Inspector Mode Toggle */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-[#0B0F17] p-1">
            <button
              type="button"
              onClick={() => setInspectorMode('camera')}
              className={`min-h-[38px] rounded-md px-3 text-xs font-medium transition-colors ${
                inspectorMode === 'camera'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cameras ({cameras.length})
            </button>
            <button
              type="button"
              onClick={() => setInspectorMode('object')}
              className={`min-h-[38px] rounded-md px-3 text-xs font-medium transition-colors ${
                inspectorMode === 'object'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Objects ({spatialObjects.length})
            </button>
          </div>

          {inspectorMode === 'camera' && selectedCamera ? (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
              {/* Camera Selector Strip */}
              <div className="flex flex-wrap gap-1.5">
                {cameras.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => setSelectedCameraId(cam.id)}
                    className={`min-h-[36px] rounded-lg px-3 py-1 font-mono text-xs font-medium transition-colors ${
                      cam.id === selectedCamera.id
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-800 bg-[#10151F] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    {cam.id}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Camera Name</span>
                  <input
                    type="text"
                    value={selectedCamera.name}
                    onChange={(e) => updateSelectedCamera({ name: e.target.value })}
                    className="w-full min-h-[40px] rounded-lg border border-slate-800 bg-[#10151F] px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Height / Angle</span>
                  <select
                    value={selectedCamera.heightLabel}
                    onChange={(e) =>
                      updateSelectedCamera({
                        heightLabel: e.target.value as CameraHeightLabel,
                      })
                    }
                    className="w-full min-h-[40px] rounded-lg border border-slate-800 bg-[#10151F] px-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Low Angle">Low Angle</option>
                    <option value="Eye Level">Eye Level</option>
                    <option value="High Angle">High Angle</option>
                    <option value="Overhead">Overhead</option>
                  </select>
                </label>
              </div>

              {/* Direction Angle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Aim Direction</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {selectedCamera.angle}° ({focalLengthToFovDeg(selectedCamera.focalLength)}° FOV)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={selectedCamera.angle}
                  onChange={(e) => updateSelectedCamera({ angle: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Focal Length Presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Focal Length</span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {selectedCamera.focalLength}mm
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {FOCAL_PRESETS.map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => updateSelectedCamera({ focalLength: mm })}
                      className={`min-h-[36px] rounded border font-mono text-xs tabular-nums transition-colors ${
                        selectedCamera.focalLength === mm
                          ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                          : 'border-slate-800 bg-[#10151F] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mm}
                    </button>
                  ))}
                </div>
              </div>

              {/* Computed Screen-Space Perspective */}
              <div className="border-t border-slate-800/80 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-200">
                    Computed Frame Placement ({selectedCamera.id})
                  </h4>
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={deleteSelectedCamera}
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {cameraPerspective.map((rel) => (
                    <div
                      key={rel.objectId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/70 bg-[#10151F] px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate font-medium text-slate-200">{rel.label}</span>
                      <span
                        className={`font-mono text-[11px] tabular-nums whitespace-nowrap ${
                          rel.inFov && rel.screenZone !== 'behind-camera'
                            ? 'text-blue-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {rel.screenZone} · {rel.distanceMeters}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0B0F17] p-4">
              {/* Room Dimensions */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Room Width (m)</span>
                  <input
                    type="number"
                    min={4}
                    max={30}
                    step={0.5}
                    disabled={layoutConfirmed}
                    value={roomWidth}
                    onChange={(e) => onChangeRoomSize(Number(e.target.value) || 10, roomDepth)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-3 font-mono text-sm text-slate-100 disabled:opacity-50"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-400">Room Depth (m)</span>
                  <input
                    type="number"
                    min={4}
                    max={30}
                    step={0.5}
                    disabled={layoutConfirmed}
                    value={roomDepth}
                    onChange={(e) => onChangeRoomSize(roomWidth, Number(e.target.value) || 8)}
                    className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-3 font-mono text-sm text-slate-100 disabled:opacity-50"
                  />
                </label>
              </div>

              {selectedObject ? (
                <div className="space-y-3 border-t border-slate-800/80 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-blue-400">{selectedObject.id}</span>
                    <button
                      type="button"
                      disabled={layoutConfirmed}
                      onClick={deleteSelectedObject}
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Object Label</span>
                    <input
                      type="text"
                      disabled={layoutConfirmed}
                      value={selectedObject.label}
                      onChange={(e) => updateSelectedObject({ label: e.target.value })}
                      className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-3 text-sm text-slate-100 disabled:opacity-60"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2.5">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">World X (m)</span>
                      <input
                        type="number"
                        step={0.1}
                        disabled={layoutConfirmed}
                        value={selectedObject.x}
                        onChange={(e) => updateSelectedObject({ x: Number(e.target.value) })}
                        className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-2.5 font-mono text-xs text-slate-100 disabled:opacity-60"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">World Y (m)</span>
                      <input
                        type="number"
                        step={0.1}
                        disabled={layoutConfirmed}
                        value={selectedObject.y}
                        onChange={(e) => updateSelectedObject({ y: Number(e.target.value) })}
                        className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-2.5 font-mono text-xs text-slate-100 disabled:opacity-60"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Width (m)</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0.2}
                        disabled={layoutConfirmed}
                        value={selectedObject.width}
                        onChange={(e) => updateSelectedObject({ width: Number(e.target.value) })}
                        className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-2.5 font-mono text-xs text-slate-100 disabled:opacity-60"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Depth (m)</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0.2}
                        disabled={layoutConfirmed}
                        value={selectedObject.depth}
                        onChange={(e) => updateSelectedObject({ depth: Number(e.target.value) })}
                        className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-2.5 font-mono text-xs text-slate-100 disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-slate-400">
                        <RotateCw className="h-3 w-3" aria-hidden="true" />
                        Rotation
                      </span>
                      <span className="font-mono text-slate-200 tabular-nums">
                        {selectedObject.rotation}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      disabled={layoutConfirmed}
                      value={selectedObject.rotation}
                      onChange={(e) =>
                        updateSelectedObject({ rotation: Number(e.target.value) })
                      }
                      className="w-full accent-blue-500 disabled:opacity-50"
                    />
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Link Reference ID</span>
                    <select
                      disabled={layoutConfirmed}
                      value={selectedObject.linkedReferenceId || ''}
                      onChange={(e) =>
                        updateSelectedObject({
                          linkedReferenceId: e.target.value || undefined,
                        })
                      }
                      className="w-full min-h-[38px] rounded-lg border border-slate-800 bg-[#10151F] px-2.5 text-xs text-slate-100 disabled:opacity-60"
                    >
                      <option value="">None</option>
                      {references.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} · {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Tap an object on the floor plan or add one above to inspect its coordinates.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
