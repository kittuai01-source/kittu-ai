export interface CompressedImage {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Compresses an uploaded File or image URL to a clean max-1280px JPEG/PNG dataUrl
 * so Gemini Vision payloads stay fast and IndexedDB project saves remain lightweight.
 */
export async function compressImageFile(file: File, maxDim = 1280): Promise<CompressedImage> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  return compressDataUrl(rawDataUrl, maxDim);
}

export async function urlToCompressedDataUrl(url: string, maxDim = 1280): Promise<CompressedImage> {
  if (url.startsWith('data:')) {
    return compressDataUrl(url, maxDim);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load image: ${url}`);
  }
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to convert image blob'));
    reader.readAsDataURL(blob);
  });
  return compressDataUrl(dataUrl, maxDim);
}

export async function compressDataUrl(rawDataUrl: string, maxDim = 1280): Promise<CompressedImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image data'));
    el.src = rawDataUrl;
  });

  const origW = img.naturalWidth || 1024;
  const origH = img.naturalHeight || 1024;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const width = Math.max(1, Math.round(origW * scale));
  const height = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: rawDataUrl, mimeType: 'image/jpeg', width: origW, height: origH };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const mimeType = 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, 0.88);
  return { dataUrl, mimeType, width, height };
}

export function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Image must be a base64 data URL');
  }
  return { mimeType: match[1], base64: match[2] };
}
