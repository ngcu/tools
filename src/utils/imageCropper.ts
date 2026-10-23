export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoCropOptions {
  tolerance?: number; // 0 to 100, default 15
  sampleSize?: number; // corner sample size in px, default 5
}

export interface AutoCropResult {
  rect: CropRect;
  trimmedPixels: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  detectedBg: {
    r: number;
    g: number;
    b: number;
    a: number;
    isTransparent: boolean;
  };
}

/**
 * Calculates color distance (Euclidean distance in RGBA space)
 */
function colorDistance(
  r1: number, g1: number, b1: number, a1: number,
  r2: number, g2: number, b2: number, a2: number
): number {
  // If both are transparent, distance is 0
  if (a1 < 10 && a2 < 10) return 0;
  // If transparency differs significantly
  const dAlpha = Math.abs(a1 - a2);
  if (dAlpha > 40) return 255;

  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Analyzes the 4 corners of the image to determine the dominant background color and alpha.
 * Then scans top, bottom, left, right to detect content bounding box.
 */
export function detectAutoCropBounds(
  canvas: HTMLCanvasElement,
  options: AutoCropOptions = {}
): AutoCropResult {
  const { tolerance = 18, sampleSize = 4 } = options;
  const width = canvas.width;
  const height = canvas.height;

  const defaultRect: CropRect = { x: 0, y: 0, width, height };
  const defaultResult: AutoCropResult = {
    rect: defaultRect,
    trimmedPixels: { top: 0, bottom: 0, left: 0, right: 0 },
    detectedBg: { r: 255, g: 255, b: 255, a: 255, isTransparent: false }
  };

  if (width <= 2 || height <= 2) return defaultResult;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return defaultResult;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Sample 4 corners to establish background color
  const cornerPoints = [
    { x: 0, y: 0 },
    { x: Math.max(0, width - 1), y: 0 },
    { x: 0, y: Math.max(0, height - 1) },
    { x: Math.max(0, width - 1), y: Math.max(0, height - 1) }
  ];

  let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
  let transparentSamples = 0;
  let totalSamples = 0;

  for (const pt of cornerPoints) {
    const maxX = Math.min(width, pt.x + sampleSize);
    const maxY = Math.min(height, pt.y + sampleSize);
    const minX = Math.max(0, pt.x - sampleSize + 1);
    const minY = Math.max(0, pt.y - sampleSize + 1);

    for (let sy = minY; sy < maxY; sy++) {
      for (let sx = minX; sx < maxX; sx++) {
        const idx = (sy * width + sx) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        sumR += r;
        sumG += g;
        sumB += b;
        sumA += a;
        if (a < 15) transparentSamples++;
        totalSamples++;
      }
    }
  }

  const bgR = Math.round(sumR / totalSamples);
  const bgG = Math.round(sumG / totalSamples);
  const bgB = Math.round(sumB / totalSamples);
  const bgA = Math.round(sumA / totalSamples);
  const isTransparentBg = transparentSamples / totalSamples > 0.5 || bgA < 20;

  const threshold = tolerance * 2.55; // scale 0~100 to 0~255

  const isBackgroundPixel = (x: number, y: number): boolean => {
    const idx = (y * width + x) * 4;
    const a = data[idx + 3];

    // Check transparent
    if (isTransparentBg) {
      return a <= Math.max(25, threshold);
    }

    if (a < 15) {
      // Transparency in a non-transparent assumed background is considered non-background (content)
      return false;
    }

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const dist = colorDistance(r, g, b, a, bgR, bgG, bgB, bgA);
    return dist <= threshold;
  };

  // 2. Scan Top
  let top = 0;
  for (let y = 0; y < height; y++) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      if (!isBackgroundPixel(x, y)) {
        rowHasContent = true;
        break;
      }
    }
    if (rowHasContent) {
      top = y;
      break;
    }
  }

  // 3. Scan Bottom
  let bottom = height - 1;
  for (let y = height - 1; y >= top; y--) {
    let rowHasContent = false;
    for (let x = 0; x < width; x++) {
      if (!isBackgroundPixel(x, y)) {
        rowHasContent = true;
        break;
      }
    }
    if (rowHasContent) {
      bottom = y;
      break;
    }
  }

  // 4. Scan Left
  let left = 0;
  for (let x = 0; x < width; x++) {
    let colHasContent = false;
    for (let y = top; y <= bottom; y++) {
      if (!isBackgroundPixel(x, y)) {
        colHasContent = true;
        break;
      }
    }
    if (colHasContent) {
      left = x;
      break;
    }
  }

  // 5. Scan Right
  let right = width - 1;
  for (let x = width - 1; x >= left; x--) {
    let colHasContent = false;
    for (let y = top; y <= bottom; y++) {
      if (!isBackgroundPixel(x, y)) {
        colHasContent = true;
        break;
      }
    }
    if (colHasContent) {
      right = x;
      break;
    }
  }

  // Safety check: ensure bounded rect is valid
  const rectW = Math.max(1, right - left + 1);
  const rectH = Math.max(1, bottom - top + 1);

  return {
    rect: {
      x: left,
      y: top,
      width: rectW,
      height: rectH
    },
    trimmedPixels: {
      top,
      bottom: height - 1 - bottom,
      left,
      right: width - 1 - right
    },
    detectedBg: {
      r: bgR,
      g: bgG,
      b: bgB,
      a: bgA,
      isTransparent: isTransparentBg
    }
  };
}

/**
 * Crops the image using offscreen canvas and returns Blob + DataURL
 */
export async function cropImageToBlob(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  rect: CropRect,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  quality: number = 0.92
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));

  const ctx = canvas.getContext('2d', { alpha: format === 'png' || format === 'webp' });
  if (!ctx) throw new Error('Canvas 2D context creation failed');

  // If JPEG, fill with white background so transparency doesn't turn black
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(
    imageSource,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
    0,
    0,
    canvas.width,
    canvas.height
  );

  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create image blob'));
          return;
        }
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve({
          blob,
          dataUrl,
          width: canvas.width,
          height: canvas.height
        });
      },
      mimeType,
      quality
    );
  });
}

/**
 * Copies a PNG blob directly to clipboard if supported
 */
export async function copyImageBlobToClipboard(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  rect: CropRect
): Promise<boolean> {
  try {
    // Clipboard API requires PNG
    const { blob } = await cropImageToBlob(imageSource, rect, 'png', 1.0);
    if (!navigator.clipboard || !window.ClipboardItem) {
      return false;
    }
    const item = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([item]);
    return true;
  } catch (err) {
    console.warn('Clipboard write error:', err);
    return false;
  }
}

/**
 * Formats bytes to scannable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
