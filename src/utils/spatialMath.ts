import type { CameraRig, SpatialObject } from '../types.ts';

export interface CameraObjectRelation {
  objectId: string;
  label: string;
  type: SpatialObject['type'];
  distanceMeters: number;
  relativeBearingDeg: number;
  screenZone: 'far-left' | 'left' | 'center' | 'right' | 'far-right' | 'behind-camera';
  depthZone: 'foreground' | 'midground' | 'background';
  inFov: boolean;
}

export function focalLengthToFovDeg(focalLengthMm: number): number {
  // Full-frame 36mm sensor horizontal FOV
  const sensorWidthMm = 36;
  const clamped = Math.max(12, Math.min(200, focalLengthMm));
  const fovRad = 2 * Math.atan(sensorWidthMm / (2 * clamped));
  return Math.round((fovRad * 180) / Math.PI);
}

export function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

export function signedAngleDiffDeg(targetDeg: number, sourceDeg: number): number {
  let diff = normalizeAngleDeg(targetDeg) - normalizeAngleDeg(sourceDeg);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/**
 * Computes exact camera-space visibility and left/center/right screen placement
 * from immutable world-space coordinates.
 * Convention: 0 deg = North (-Y), 90 deg = East (+X), 180 deg = South (+Y), 270 deg = West (-X).
 */
export function computeCameraPerspective(
  camera: CameraRig,
  objects: SpatialObject[]
): CameraObjectRelation[] {
  const halfFov = focalLengthToFovDeg(camera.focalLength) / 2;

  return objects
    .map((obj) => {
      const dx = obj.x - camera.x;
      const dy = obj.y - camera.y;
      const distanceMeters = Number(Math.hypot(dx, dy).toFixed(2));

      // World bearing where 0 = -Y (North), 90 = +X (East)
      const rad = Math.atan2(dx, -dy);
      const bearingDeg = normalizeAngleDeg((rad * 180) / Math.PI);
      const rel = Number(signedAngleDiffDeg(bearingDeg, camera.angle).toFixed(1));

      let screenZone: CameraObjectRelation['screenZone'] = 'center';
      if (Math.abs(rel) > 95) {
        screenZone = 'behind-camera';
      } else if (rel <= -halfFov * 0.85) {
        screenZone = 'far-left';
      } else if (rel < -halfFov * 0.25) {
        screenZone = 'left';
      } else if (rel <= halfFov * 0.25) {
        screenZone = 'center';
      } else if (rel < halfFov * 0.85) {
        screenZone = 'right';
      } else {
        screenZone = 'far-right';
      }

      const depthZone: CameraObjectRelation['depthZone'] =
        distanceMeters < 2.3 ? 'foreground' : distanceMeters < 5.2 ? 'midground' : 'background';

      const inFov = Math.abs(rel) <= halfFov + 8;

      return {
        objectId: obj.id,
        label: obj.label,
        type: obj.type,
        distanceMeters,
        relativeBearingDeg: rel,
        screenZone,
        depthZone,
        inFov,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function formatCameraSpatialBrief(
  camera: CameraRig,
  objects: SpatialObject[]
): string {
  const fov = focalLengthToFovDeg(camera.focalLength);
  const relations = computeCameraPerspective(camera, objects);
  const visible = relations.filter((r) => r.inFov && r.screenZone !== 'behind-camera');
  const behind = relations.filter((r) => r.screenZone === 'behind-camera');

  const visibleSummary = visible.length
    ? visible
        .map(
          (r) =>
            `${r.label} (${r.type}, ${r.screenZone}, ${r.depthZone}, ${r.distanceMeters}m away)`
        )
        .join('; ')
    : 'No locked objects inside current frustum';

  const behindSummary = behind.length
    ? `Behind camera (must not appear in frame): ${behind.map((b) => b.label).join(', ')}`
    : '';

  return `${camera.id} "${camera.name}" at world (${camera.x.toFixed(1)}m, ${camera.y.toFixed(1)}m), facing ${Math.round(camera.angle)}deg, ${camera.focalLength}mm (~${fov}deg FOV), ${camera.heightLabel}. Visible layout: ${visibleSummary}. ${behindSummary}`.trim();
}
