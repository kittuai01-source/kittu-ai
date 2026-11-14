import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image payload; expected base64 data URL.');
  }
  return { mimeType: match[1], data: match[2] };
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API key is missing or invalid. Please check Settings > Secrets.',
    };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  return { status: 500, message: msg || 'Unexpected server error calling Gemini.' };
}

function safeJsonParse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, model: MODEL_NAME, hasKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // 1. Analyze a single reference image via Gemini Vision
  app.post('/api/analyze-reference', async (req, res) => {
    try {
      const { name, category, dataUrl } = req.body as {
        name?: string;
        category?: string;
        dataUrl?: string;
      };
      if (!dataUrl || !category) {
        res.status(400).json({ error: 'dataUrl and category are required.' });
        return;
      }

      const ai = getAiClient();
      const image = parseDataUrl(dataUrl);

      const categoryFocus: Record<string, string> = {
        character:
          'Focus on facial features, hair, age range, skin tone, exact clothing layers, colors, fabrics, accessories, and visible lighting on the subject.',
        background:
          'Focus on room architecture, wall finishes, doors, windows and their relative sides (left/right/back), furniture placement, depth, and ambient lighting sources.',
        prop:
          'Focus on exact material, color, wear/patina, markings, scale, accompanying items, and surface texture.',
        lighting:
          'Focus on color temperature (Kelvin feel), key light direction, contrast ratio, rim/fill colors, practical fixtures, and shadow softness.',
      };

      const prompt = `Analyze this visual reference image labeled "${name || 'Reference'}" in category "${category}".
${categoryFocus[category] || categoryFocus.background}
Only describe clearly visible details—do not invent unseen items.`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: image.mimeType, data: image.data } },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visionSummary: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence visual anchor description for image generation.',
              },
              extractedDetails: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '4 to 6 specific visible visual traits.',
              },
            },
            required: ['visionSummary', 'extractedDetails'],
          },
        },
      });

      const parsed = safeJsonParse(response.text, {
        visionSummary: 'Reference image analyzed.',
        extractedDetails: [],
      });
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 2. Detect 2D top-view spatial floor plan elements from a background reference image
  app.post('/api/detect-layout', async (req, res) => {
    try {
      const { dataUrl, roomWidth = 10, roomDepth = 8, referenceId } = req.body as {
        dataUrl?: string;
        roomWidth?: number;
        roomDepth?: number;
        referenceId?: string;
      };
      if (!dataUrl) {
        res.status(400).json({ error: 'Background reference dataUrl is required.' });
        return;
      }

      const ai = getAiClient();
      const image = parseDataUrl(dataUrl);

      const prompt = `Inspect this location/background photograph and infer a clean 2D top-down architectural floor plan inside a ${roomWidth}m wide (X: 0 to ${roomWidth}, West=0, East=${roomWidth}) by ${roomDepth}m deep (Y: 0 to ${roomDepth}, North/back=0, South/camera side=${roomDepth}) coordinate space.
Detect visible walls, windows, doors, large furniture, and key props.
Assume the camera taking this reference photo is near South (Y=${(roomDepth * 0.85).toFixed(1)}) looking toward North (Y=0).
Return practical coordinates, realistic widths/depths in meters, and rotation degrees (0-359).`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            { inlineData: { mimeType: image.mimeType, data: image.data } },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              notes: { type: Type.STRING },
              objects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    type: {
                      type: Type.STRING,
                      description: 'One of: wall, window, door, furniture, prop',
                    },
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    depth: { type: Type.NUMBER },
                    rotation: { type: Type.NUMBER },
                  },
                  required: ['label', 'type', 'x', 'y', 'width', 'depth', 'rotation'],
                },
              },
            },
            required: ['notes', 'objects'],
          },
        },
      });

      const parsed = safeJsonParse<{
        notes: string;
        objects: Array<{
          label: string;
          type: string;
          x: number;
          y: number;
          width: number;
          depth: number;
          rotation: number;
        }>;
      }>(response.text, { notes: '', objects: [] });

      const allowedTypes = new Set(['wall', 'window', 'door', 'furniture', 'prop']);
      const normalized = parsed.objects.map((obj, idx) => ({
        id: `OBJ_${String(idx + 1).padStart(2, '0')}`,
        label: obj.label,
        type: allowedTypes.has(obj.type) ? obj.type : 'furniture',
        x: Math.max(0.2, Math.min(roomWidth - 0.2, Number(obj.x.toFixed(2)))),
        y: Math.max(0.2, Math.min(roomDepth - 0.2, Number(obj.y.toFixed(2)))),
        width: Math.max(0.3, Math.min(roomWidth, Number(obj.width.toFixed(2)))),
        depth: Math.max(0.25, Math.min(roomDepth, Number(obj.depth.toFixed(2)))),
        rotation: Math.round(obj.rotation || 0) % 360,
        linkedReferenceId: referenceId || undefined,
      }));

      res.json({ notes: parsed.notes, objects: normalized });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 3. Analyze Telugu / English / mixed scene description
  app.post('/api/analyze-scene', async (req, res) => {
    try {
      const { sceneDescription, references, shotCountMode, manualShotCount } = req.body as {
        sceneDescription?: string;
        references?: Array<{ id: string; name: string; category: string; visionSummary?: string }>;
        shotCountMode?: 'auto' | 'manual';
        manualShotCount?: number;
      };

      if (!sceneDescription?.trim()) {
        res.status(400).json({ error: 'Please enter a scene description in Telugu or English.' });
        return;
      }

      const ai = getAiClient();
      const refText = (references || [])
        .map(
          (r) =>
            `- ${r.id} (${r.category}): "${r.name}"${r.visionSummary ? ` — ${r.visionSummary}` : ''}`
        )
        .join('\n');

      const prompt = `You are a veteran Film Director & Script Supervisor fluent in Telugu and English.
Analyze the following scene description (which may be written in Telugu script, English, or Telugu-English):

SCENE DESCRIPTION:
"""
${sceneDescription}
"""

AVAILABLE REFERENCE LIBRARY:
${refText || 'No references uploaded yet.'}

${
  shotCountMode === 'manual' && manualShotCount
    ? `User requested manual override of ${manualShotCount} shots; explain how to pace those ${manualShotCount} beats cleanly.`
    : 'Determine the optimal number of cinematic shots (typically 3 to 8) needed to tell this scene with visual continuity.'
}`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              languageDetected: { type: Type.STRING },
              summaryEnglish: { type: Type.STRING },
              summaryTeluguEnglish: {
                type: Type.STRING,
                description:
                  'Clear conversational Telugu-English (Romanized Tenglish) explanation of the scene beats.',
              },
              locations: { type: Type.ARRAY, items: { type: Type.STRING } },
              characters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    emotion: { type: Type.STRING },
                    action: { type: Type.STRING },
                    referenceId: { type: Type.STRING },
                  },
                  required: ['name', 'emotion', 'action'],
                },
              },
              emotionalArc: { type: Type.STRING },
              continuityAnchors: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Specific continuity details that must stay constant across cuts.',
              },
              recommendedShotCount: { type: Type.INTEGER },
              reasoning: { type: Type.STRING },
            },
            required: [
              'languageDetected',
              'summaryEnglish',
              'summaryTeluguEnglish',
              'locations',
              'characters',
              'emotionalArc',
              'continuityAnchors',
              'recommendedShotCount',
              'reasoning',
            ],
          },
        },
      });

      const parsed = safeJsonParse(response.text, null);
      if (!parsed) {
        res.status(502).json({ error: 'Gemini returned an unreadable scene analysis payload.' });
        return;
      }
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 4. Generate Shot-by-Shot Prompts locked to world-space coordinates & camera mapping
  app.post('/api/generate-shots', async (req, res) => {
    try {
      const {
        sceneDescription,
        sceneAnalysis,
        references,
        spatialObjects,
        layoutConfirmed,
        cameras,
        cameraBriefs,
        consistencyMode,
        categoryLocks,
        targetShotCount,
      } = req.body as {
        sceneDescription: string;
        sceneAnalysis: unknown;
        references: Array<{
          id: string;
          name: string;
          category: string;
          visionSummary?: string;
          extractedDetails?: string[];
        }>;
        spatialObjects: Array<{
          id: string;
          label: string;
          type: string;
          x: number;
          y: number;
          width: number;
          depth: number;
          rotation: number;
          linkedReferenceId?: string;
        }>;
        layoutConfirmed: boolean;
        cameras: Array<{
          id: string;
          name: string;
          x: number;
          y: number;
          angle: number;
          focalLength: number;
          heightLabel: string;
        }>;
        cameraBriefs: string[];
        consistencyMode: 'strict' | 'flexible';
        categoryLocks: {
          character: boolean;
          background: boolean;
          prop: boolean;
          lighting: boolean;
        };
        targetShotCount: number;
      };

      if (!sceneDescription?.trim()) {
        res.status(400).json({ error: 'Scene description is required to generate shots.' });
        return;
      }

      const ai = getAiClient();

      const lockSummary =
        consistencyMode === 'strict'
          ? 'STRICT REFERENCE LOCK: All categories (Character, Background, Prop, Lighting) and confirmed spatial coordinates are strictly locked across every shot.'
          : `FLEXIBLE REFERENCE MODE: Locked categories -> Character: ${categoryLocks.character}, Background: ${categoryLocks.background}, Prop: ${categoryLocks.prop}, Lighting: ${categoryLocks.lighting}. Respect locked categories strictly while allowing unlocked categories natural cinematic variation.`;

      const prompt = `You are a Principal Cinematographer and AI Image-Prompt Architect.
Generate exactly ${targetShotCount} sequential cinematic shot prompts for this scene.

SCENE DESCRIPTION (Telugu / English):
"""
${sceneDescription}
"""

SCENE ANALYSIS:
${JSON.stringify(sceneAnalysis || {}, null, 2)}

REFERENCE LIBRARY (use these exact IDs and preserve their visual traits):
${JSON.stringify(references || [], null, 2)}

WORLD-SPACE FLOOR PLAN (${layoutConfirmed ? 'CONFIRMED IMMUTABLE SPATIAL LOCK' : 'DRAFT LAYOUT'}):
${JSON.stringify(spatialObjects || [], null, 2)}

CAMERA MAPPINGS & COMPUTED SCREEN-SPACE VISIBILITY:
${(cameraBriefs || []).join('\n')}
Available Camera IDs: ${(cameras || []).map((c) => `${c.id} (${c.name}, ${c.focalLength}mm, ${c.heightLabel})`).join(', ')}

CONSISTENCY POLICY:
${lockSummary}

CRITICAL RULES:
1. Never alter or contradict confirmed world-space object positions. Respect left/center/right/depth placement computed for each camera's angle and focal length. Do not place objects that are behind a camera into that shot's visible frame.
2. Each shot's "prompt" must be a rich, self-contained, production-ready English image generation prompt (including subject, wardrobe/character traits, exact spatial composition, architectural landmarks, prop placement, lens/camera angle, and lighting continuity).
3. Include exact characterIds, locationIds, propIds, lightingIds, and assignedReferenceIds referencing the Reference Library IDs above.
4. Provide "teluguEnglishExplanation" in simple, natural Telugu-English (e.g., "Ee shot lo CAM_A nundi wide frame chupistam; left side rain window, center table meeda diary & chai untayi...") so the user immediately understands framing, camera angle, and continuity.`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    shotNumber: { type: Type.INTEGER },
                    shotTitle: { type: Type.STRING },
                    shotType: { type: Type.STRING },
                    cameraId: { type: Type.STRING },
                    cameraAngle: { type: Type.STRING },
                    lens: { type: Type.STRING },
                    composition: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    characterIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    locationIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    propIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    lightingIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    assignedReferenceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    worldSpaceAnchorNote: { type: Type.STRING },
                    prompt: { type: Type.STRING },
                    teluguEnglishExplanation: { type: Type.STRING },
                  },
                  required: [
                    'shotNumber',
                    'shotTitle',
                    'shotType',
                    'cameraId',
                    'cameraAngle',
                    'lens',
                    'composition',
                    'lighting',
                    'characterIds',
                    'locationIds',
                    'propIds',
                    'lightingIds',
                    'assignedReferenceIds',
                    'worldSpaceAnchorNote',
                    'prompt',
                    'teluguEnglishExplanation',
                  ],
                },
              },
            },
            required: ['shots'],
          },
        },
      });

      const parsed = safeJsonParse<{ shots: Array<Record<string, unknown>> }>(response.text, {
        shots: [],
      });

      const shots = parsed.shots.map((s, idx) => ({
        ...s,
        id: `shot_${Date.now()}_${idx + 1}`,
        shotNumber: Number(s.shotNumber) || idx + 1,
      }));

      res.json({ shots });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 5. Continuity Validator: Audit generated prompts for contradictions
  app.post('/api/validate-prompts', async (req, res) => {
    try {
      const { shots, references, spatialObjects, cameraBriefs, consistencyMode, categoryLocks } =
        req.body as {
          shots: unknown[];
          references: unknown[];
          spatialObjects: unknown[];
          cameraBriefs: string[];
          consistencyMode: string;
          categoryLocks: unknown;
        };

      if (!shots?.length) {
        res.status(400).json({ error: 'Generate shots first before running prompt audit.' });
        return;
      }

      const ai = getAiClient();
      const prompt = `You are a rigorous Continuity Supervisor auditing generated image prompts.
Compare the generated shots against the confirmed world-space floor plan, camera screen-space visibility briefs, reference library, and consistency locks.

CONFIRMED SPATIAL OBJECTS:
${JSON.stringify(spatialObjects, null, 2)}

CAMERA SCREEN-SPACE BRIEFS:
${(cameraBriefs || []).join('\n')}

REFERENCE LIBRARY:
${JSON.stringify(references, null, 2)}

CONSISTENCY MODE: ${consistencyMode}, LOCKS: ${JSON.stringify(categoryLocks)}

GENERATED SHOTS TO AUDIT:
${JSON.stringify(shots, null, 2)}

Report ONLY genuine potential contradictions, spatial left/right inversions, architectural drift, missing locked character wardrobe/props, or lighting contradictions. If no major contradictions are found, say so honestly without inventing fake errors, and note any subtle risks to watch for during image generation.`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    shotNumber: { type: Type.INTEGER },
                    category: {
                      type: Type.STRING,
                      description:
                        'One of: object_displacement, architectural_change, character_inconsistency, lighting_drift, prompt_contradiction',
                    },
                    severity: {
                      type: Type.STRING,
                      description: 'One of: info, warning, conflict',
                    },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    recommendation: { type: Type.STRING },
                  },
                  required: ['category', 'severity', 'title', 'detail', 'recommendation'],
                },
              },
            },
            required: ['summary', 'issues'],
          },
        },
      });

      const parsed = safeJsonParse<{
        summary: string;
        issues: Array<Record<string, unknown>>;
      }>(response.text, { summary: 'Audit completed.', issues: [] });

      res.json({
        id: `val_${Date.now()}`,
        mode: 'prompts',
        checkedAt: new Date().toISOString(),
        disclaimer:
          'Automated prompt inspection checks text alignment against your spatial model and references. Always review visual outputs directly, as external image generators may still vary.',
        summary: parsed.summary,
        issues: parsed.issues.map((item, idx) => ({
          ...item,
          id: `issue_${Date.now()}_${idx}`,
        })),
      });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 6. Continuity Validator: Compare an uploaded generated result image with reference images
  app.post('/api/validate-image', async (req, res) => {
    try {
      const { shot, generatedImageDataUrl, referenceImages, cameraBrief } = req.body as {
        shot: {
          shotNumber: number;
          shotTitle: string;
          cameraId: string;
          composition: string;
          lighting: string;
          prompt: string;
          worldSpaceAnchorNote: string;
        };
        generatedImageDataUrl: string;
        referenceImages: Array<{ id: string; name: string; category: string; dataUrl: string }>;
        cameraBrief: string;
      };

      if (!generatedImageDataUrl || !shot) {
        res.status(400).json({ error: 'Shot details and generated result image are required.' });
        return;
      }

      const ai = getAiClient();
      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      const genImg = parseDataUrl(generatedImageDataUrl);
      parts.push({ text: 'IMAGE A — GENERATED SHOT RESULT TO VALIDATE:' });
      parts.push({ inlineData: { mimeType: genImg.mimeType, data: genImg.data } });

      for (const ref of referenceImages || []) {
        try {
          const parsedRef = parseDataUrl(ref.dataUrl);
          parts.push({
            text: `REFERENCE (${ref.id} · ${ref.category} · "${ref.name}"):`,
          });
          parts.push({ inlineData: { mimeType: parsedRef.mimeType, data: parsedRef.data } });
        } catch {
          // Skip invalid non-base64 reference
        }
      }

      parts.push({
        text: `Compare IMAGE A (Generated Shot #${shot.shotNumber}: "${shot.shotTitle}") against the provided Reference Images and this expected spatial framing:
CAMERA & SPATIAL BRIEF: ${cameraBrief}
EXPECTED COMPOSITION: ${shot.composition}
EXPECTED LIGHTING: ${shot.lighting}
WORLD-SPACE ANCHOR: ${shot.worldSpaceAnchorNote}

Carefully inspect for:
1. Object displacement (props, furniture, windows, doors appearing on the wrong side or missing)
2. Architectural changes (wall layout, window frame, door position/style changed vs background reference)
3. Character inconsistencies (face/hair/wardrobe/color differences vs character reference)
4. Lighting drift

Be honest and evidence-based: state only what is visually observable in IMAGE A vs the references. Do NOT claim 100% guaranteed consistency.`,
      });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: {
                      type: Type.STRING,
                      description:
                        'One of: object_displacement, architectural_change, character_inconsistency, lighting_drift, prompt_contradiction',
                    },
                    severity: {
                      type: Type.STRING,
                      description: 'One of: info, warning, conflict',
                    },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    recommendation: { type: Type.STRING },
                  },
                  required: ['category', 'severity', 'title', 'detail', 'recommendation'],
                },
              },
            },
            required: ['summary', 'issues'],
          },
        },
      });

      const parsed = safeJsonParse<{
        summary: string;
        issues: Array<Record<string, unknown>>;
      }>(response.text, { summary: 'Visual comparison finished.', issues: [] });

      res.json({
        id: `val_img_${Date.now()}`,
        mode: 'image',
        shotNumber: shot.shotNumber,
        checkedAt: new Date().toISOString(),
        disclaimer:
          'Visual comparison reports observed similarities and potential discrepancies between the uploaded frame and your references. It cannot guarantee absolute continuity.',
        summary: parsed.summary,
        issues: parsed.issues.map((item, idx) => ({
          ...item,
          shotNumber: shot.shotNumber,
          id: `issue_img_${Date.now()}_${idx}`,
        })),
      });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`KITTU AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KITTU AI server:', err);
  process.exit(1);
});
