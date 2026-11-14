export type ReferenceCategory = 'character' | 'background' | 'prop' | 'lighting';

export interface ReferenceItem {
  id: string;
  name: string;
  category: ReferenceCategory;
  dataUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  analysisStatus: 'idle' | 'analyzing' | 'done' | 'error';
  analysisError?: string;
  visionSummary?: string;
  extractedDetails?: string[];
}

export type SpatialObjectType = 'wall' | 'window' | 'door' | 'furniture' | 'prop' | 'character';

export interface SpatialObject {
  id: string;
  label: string;
  type: SpatialObjectType;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  linkedReferenceId?: string;
  notes?: string;
}

export type CameraHeightLabel = 'Low Angle' | 'Eye Level' | 'High Angle' | 'Overhead';

export interface CameraRig {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number; // 0 = North (-Y), 90 = East (+X), 180 = South (+Y), 270 = West (-X)
  focalLength: number; // mm (e.g. 24, 35, 50, 85)
  heightLabel: CameraHeightLabel;
  color: string;
}

export type ConsistencyMode = 'strict' | 'flexible';

export interface CategoryLocks {
  character: boolean;
  background: boolean;
  prop: boolean;
  lighting: boolean;
}

export interface SceneCharacterBeat {
  name: string;
  emotion: string;
  action: string;
  referenceId?: string;
}

export interface SceneAnalysis {
  languageDetected: string;
  summaryEnglish: string;
  summaryTeluguEnglish: string;
  locations: string[];
  characters: SceneCharacterBeat[];
  emotionalArc: string;
  continuityAnchors: string[];
  recommendedShotCount: number;
  reasoning: string;
}

export interface GeneratedShot {
  id: string;
  shotNumber: number;
  shotTitle: string;
  shotType: string;
  cameraId: string;
  cameraAngle: string;
  lens: string;
  composition: string;
  lighting: string;
  characterIds: string[];
  locationIds: string[];
  propIds: string[];
  lightingIds: string[];
  assignedReferenceIds: string[];
  worldSpaceAnchorNote: string;
  prompt: string;
  teluguEnglishExplanation: string;
  uploadedResultDataUrl?: string;
}

export type ValidationCategory =
  | 'object_displacement'
  | 'architectural_change'
  | 'character_inconsistency'
  | 'lighting_drift'
  | 'prompt_contradiction';

export type ValidationSeverity = 'info' | 'warning' | 'conflict';

export interface ValidationIssue {
  id: string;
  shotNumber?: number;
  category: ValidationCategory;
  severity: ValidationSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

export interface ValidationReport {
  id: string;
  mode: 'prompts' | 'image';
  shotNumber?: number;
  checkedAt: string;
  disclaimer: string;
  summary: string;
  issues: ValidationIssue[];
}

export interface SceneProject {
  id: string;
  name: string;
  updatedAt: string;
  roomWidth: number;
  roomDepth: number;
  references: ReferenceItem[];
  spatialObjects: SpatialObject[];
  layoutConfirmed: boolean;
  cameras: CameraRig[];
  consistencyMode: ConsistencyMode;
  categoryLocks: CategoryLocks;
  sceneDescription: string;
  shotCountMode: 'auto' | 'manual';
  manualShotCount: number;
  sceneAnalysis: SceneAnalysis | null;
  shots: GeneratedShot[];
  validationReports: ValidationReport[];
}

export type WorkspaceTab = 'studio' | 'spatial' | 'shots' | 'validator';
