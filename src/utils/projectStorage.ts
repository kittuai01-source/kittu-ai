import type { SceneProject } from '../types.ts';

const DB_NAME = 'scenelock_ai_db';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const LAST_ACTIVE_KEY = 'scenelock_last_project_id';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

export async function saveProjectToDb(project: SceneProject): Promise<void> {
  const db = await openDb();
  const payload: SceneProject = {
    ...project,
    updatedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(payload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save project'));
  });
  localStorage.setItem(LAST_ACTIVE_KEY, project.id);
}

export async function listProjectsFromDb(): Promise<SceneProject[]> {
  const db = await openDb();
  const items = await new Promise<SceneProject[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as SceneProject[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('Failed to list projects'));
  });
  return items.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function loadProjectFromDb(id: string): Promise<SceneProject | null> {
  const db = await openDb();
  return new Promise<SceneProject | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as SceneProject) ?? null);
    req.onerror = () => reject(req.error ?? new Error('Failed to load project'));
  });
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete project'));
  });
  if (localStorage.getItem(LAST_ACTIVE_KEY) === id) {
    localStorage.removeItem(LAST_ACTIVE_KEY);
  }
}

export function getLastActiveProjectId(): string | null {
  return localStorage.getItem(LAST_ACTIVE_KEY);
}
