import { CropRect, detectAutoCropBounds, AutoCropResult } from './imageCropper';

export type { CropRect, AutoCropResult };
export { detectAutoCropBounds };

export interface ResizeOptions {
  width: number;
  height: number;
  maintainAspectRatio: boolean;
}

export interface CanvasPaddingOptions {
  top: number;
  right: number;
  bottom: number;
  left: number;
  backgroundColor: string; // 'transparent' or hex/rgb
}

export interface SharpenOptions {
  amount: number; // 0 to 100
}

export interface MosaicOptions {
  type: 'mosaic' | 'blur';
  rect: CropRect;
  size: number; // tile size (2 to 50) or blur radius (2 to 50)
}

export interface ColorAdjustOptions {
  brightness: number; // -100 to 100 (0 = normal)
  contrast: number;   // -100 to 100 (0 = normal)
  saturation: number; // -100 to 100 (0 = normal)
}

export interface BorderOptions {
  radius: number; // 0 to 200 px
  borderWidth: number; // 0 to 50 px
  borderColor: string;
}

export interface WatermarkTextOptions {
  text: string;
  fontSize: number; // 12 to 120
  fontFamily: string;
  color: string;
  opacity: number; // 0.1 to 1.0
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
  customX?: number;
  customY?: number;
  hasBackground?: boolean;
  backgroundColor?: string;
  backgroundRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Creates a duplicate canvas from an image or canvas source
 */
export function cloneCanvas(source: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  canvas.height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(source, 0, 0);
  }
  return canvas;
}

/**
 * Resizes a canvas to target width/height
 */
export function applyResize(canvas: HTMLCanvasElement, targetW: number, targetH: number): HTMLCanvasElement {
  const resCanvas = document.createElement('canvas');
  resCanvas.width = Math.max(1, Math.round(targetW));
  resCanvas.height = Math.max(1, Math.round(targetH));
  const ctx = resCanvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, resCanvas.width, resCanvas.height);
  }
  return resCanvas;
}

/**
 * Expands canvas size with padding and background fill
 */
export function applyCanvasPadding(
  canvas: HTMLCanvasElement,
  options: CanvasPaddingOptions
): HTMLCanvasElement {
  const newW = canvas.width + options.left + options.right;
  const newH = canvas.height + options.top + options.bottom;

  const resCanvas = document.createElement('canvas');
  resCanvas.width = Math.max(1, newW);
  resCanvas.height = Math.max(1, newH);

  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  if (options.backgroundColor !== 'transparent') {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, resCanvas.width, resCanvas.height);
  }

  ctx.drawImage(canvas, options.left, options.top);
  return resCanvas;
}

/**
 * Resizes canvas using Photoshop-style 3x3 anchor point
 */
export function applyCanvasSizeWithAnchor(
  canvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
  anchorRow: number, // 0: Top, 1: Middle, 2: Bottom
  anchorCol: number, // 0: Left, 1: Center, 2: Right
  backgroundColor: string
): HTMLCanvasElement {
  const newW = Math.max(1, Math.round(targetWidth));
  const newH = Math.max(1, Math.round(targetHeight));
  const resCanvas = document.createElement('canvas');
  resCanvas.width = newW;
  resCanvas.height = newH;
  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, newW, newH);
  }

  // Horizontal delta:
  // anchorCol 0: left pinned -> dx = 0 (extends to right)
  // anchorCol 1: center pinned -> dx = (newW - oldW)/2 (extends both sides)
  // anchorCol 2: right pinned -> dx = (newW - oldW) (extends to left)
  let dx = 0;
  const diffW = newW - canvas.width;
  if (anchorCol === 0) dx = 0;
  else if (anchorCol === 1) dx = Math.round(diffW / 2);
  else if (anchorCol === 2) dx = diffW;

  // Vertical delta:
  // anchorRow 0: top pinned -> dy = 0 (extends to bottom)
  // anchorRow 1: middle pinned -> dy = (newH - oldH)/2 (extends top & bottom)
  // anchorRow 2: bottom pinned -> dy = (newH - oldH) (extends to top)
  let dy = 0;
  const diffH = newH - canvas.height;
  if (anchorRow === 0) dy = 0;
  else if (anchorRow === 1) dy = Math.round(diffH / 2);
  else if (anchorRow === 2) dy = diffH;

  ctx.drawImage(canvas, dx, dy);
  return resCanvas;
}

/**
 * Applies sharpening using a 3x3 convolution unsharp mask kernel
 */
export function applySharpen(canvas: HTMLCanvasElement, amount: number): HTMLCanvasElement {
  if (amount <= 0) return canvas;

  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Normalized weight (0 to 1)
  const weight = (amount / 100) * 1.5;
  const copy = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const up = copy[((y - 1) * w + x) * 4 + c];
        const down = copy[((y + 1) * w + x) * 4 + c];
        const left = copy[(y * w + (x - 1)) * 4 + c];
        const right = copy[(y * w + (x + 1)) * 4 + c];

        // Laplacian kernel: 5*center - (up+down+left+right)
        const laplacian = 5 * center - (up + down + left + right);
        const sharpened = center + (laplacian - center) * weight;

        data[idx + c] = Math.min(255, Math.max(0, sharpened));
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return resCanvas;
}

/**
 * Applies mosaic pixelation or box blur to a specific rectangular sub-region
 */
export function applyRegionMosaic(
  canvas: HTMLCanvasElement,
  options: MosaicOptions
): HTMLCanvasElement {
  const { rect, type, size } = options;
  if (rect.width <= 0 || rect.height <= 0) return canvas;

  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);

  const rx = Math.max(0, Math.round(rect.x));
  const ry = Math.max(0, Math.round(rect.y));
  const rw = Math.min(canvas.width - rx, Math.round(rect.width));
  const rh = Math.min(canvas.height - ry, Math.round(rect.height));

  if (rw <= 0 || rh <= 0) return canvas;

  const regionImgData = ctx.getImageData(rx, ry, rw, rh);
  const data = regionImgData.data;

  if (type === 'mosaic') {
    const tileSize = Math.max(2, Math.round(size));

    for (let y = 0; y < rh; y += tileSize) {
      for (let x = 0; x < rw; x += tileSize) {
        // Compute average color in this block
        let sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
        const blockW = Math.min(tileSize, rw - x);
        const blockH = Math.min(tileSize, rh - y);

        for (let by = 0; by < blockH; by++) {
          for (let bx = 0; bx < blockW; bx++) {
            const idx = ((y + by) * rw + (x + bx)) * 4;
            sumR += data[idx];
            sumG += data[idx + 1];
            sumB += data[idx + 2];
            sumA += data[idx + 3];
            count++;
          }
        }

        const avgR = Math.round(sumR / count);
        const avgG = Math.round(sumG / count);
        const avgB = Math.round(sumB / count);
        const avgA = Math.round(sumA / count);

        // Fill block with average
        for (let by = 0; by < blockH; by++) {
          for (let bx = 0; bx < blockW; bx++) {
            const idx = ((y + by) * rw + (x + bx)) * 4;
            data[idx] = avgR;
            data[idx + 1] = avgG;
            data[idx + 2] = avgB;
            data[idx + 3] = avgA;
          }
        }
      }
    }
  } else {
    // Blur via fast downscale and upscale
    const blurScale = Math.max(2, Math.round(size));
    const smallW = Math.max(1, Math.round(rw / blurScale));
    const smallH = Math.max(1, Math.round(rh / blurScale));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, smallW, smallH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, rx, ry, rw, rh);
      return resCanvas;
    }
  }

  ctx.putImageData(regionImgData, rx, ry);
  return resCanvas;
}

/**
 * Rotates canvas by any arbitrary angle in degrees (with 1-degree precision or 90/180/270)
 * and/or flips horizontally/vertically
 */
export function applyRotationAndFlip(
  canvas: HTMLCanvasElement,
  angleDeg: number, // Any degree: e.g. -45, -1, 0, 1, 90, 180, 270
  flipH: boolean,
  flipV: boolean
): HTMLCanvasElement {
  const normAngle = ((angleDeg % 360) + 360) % 360;
  const rad = (normAngle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  const newWidth = Math.max(1, Math.round(canvas.width * cos + canvas.height * sin));
  const newHeight = Math.max(1, Math.round(canvas.width * sin + canvas.height * cos));

  const resCanvas = document.createElement('canvas');
  resCanvas.width = newWidth;
  resCanvas.height = newHeight;

  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.translate(newWidth / 2, newHeight / 2);
  ctx.rotate(rad);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return resCanvas;
}

/**
 * Applies brightness, contrast, and saturation color adjustments
 */
export function applyColorAdjustments(
  canvas: HTMLCanvasElement,
  opts: ColorAdjustOptions
): HTMLCanvasElement {
  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  const bPercent = 100 + opts.brightness; // 0 to 200%
  const cPercent = 100 + opts.contrast;   // 0 to 200%
  const sPercent = 100 + opts.saturation; // 0 to 200%

  ctx.filter = `brightness(${bPercent}%) contrast(${cPercent}%) saturate(${sPercent}%)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';

  return resCanvas;
}

/**
 * Applies rounded corners and optional border stroke
 */
export function applyBorderAndRadius(
  canvas: HTMLCanvasElement,
  opts: BorderOptions
): HTMLCanvasElement {
  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  const r = Math.min(opts.radius, Math.min(canvas.width, canvas.height) / 2);

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(canvas.width - r, 0);
  ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r);
  ctx.lineTo(canvas.width, canvas.height - r);
  ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height);
  ctx.lineTo(r, canvas.height);
  ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(canvas, 0, 0);

  if (opts.borderWidth > 0 && opts.borderColor) {
    ctx.lineWidth = opts.borderWidth * 2; // half clipped inside
    ctx.strokeStyle = opts.borderColor;
    ctx.stroke();
  }

  return resCanvas;
}

/**
 * Overlays text or watermark on the canvas
 */
export function applyTextWatermark(
  canvas: HTMLCanvasElement,
  opts: WatermarkTextOptions
): HTMLCanvasElement {
  if (!opts.text.trim()) return canvas;

  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opts.opacity));
  ctx.font = `bold ${opts.fontSize}px ${opts.fontFamily || 'sans-serif'}`;

  const metrics = ctx.measureText(opts.text);
  const textW = metrics.width;
  const textH = opts.fontSize;
  const pad = 20;

  let x = pad;
  let y = textH + pad;

  switch (opts.position) {
    case 'center':
      x = (canvas.width - textW) / 2;
      y = (canvas.height + textH * 0.7) / 2;
      break;
    case 'top-left':
      x = pad;
      y = textH + pad;
      break;
    case 'top-right':
      x = canvas.width - textW - pad;
      y = textH + pad;
      break;
    case 'bottom-left':
      x = pad;
      y = canvas.height - pad;
      break;
    case 'bottom-right':
      x = canvas.width - textW - pad;
      y = canvas.height - pad;
      break;
    case 'custom':
      x = opts.customX ?? pad;
      y = opts.customY ?? textH + pad;
      break;
  }

  if (opts.hasBackground) {
    const bgX = x - 10;
    const bgY = y - textH - 4;
    const bgW = textW + 20;
    const bgH = textH + 12;
    const rad = Math.min(opts.backgroundRadius || 0, Math.min(bgW, bgH) / 2);

    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(bgX, bgY, bgW, bgH, rad);
    } else {
      ctx.rect(bgX, bgY, bgW, bgH);
    }

    if (opts.backgroundColor && opts.backgroundColor !== 'transparent') {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fill();
    }

    if (opts.borderWidth && opts.borderWidth > 0) {
      ctx.lineWidth = opts.borderWidth;
      ctx.strokeStyle = opts.borderColor || '#ffffff';
      if (opts.borderStyle === 'dashed') {
        ctx.setLineDash([opts.borderWidth * 3, opts.borderWidth * 2]);
      } else if (opts.borderStyle === 'dotted') {
        ctx.setLineDash([opts.borderWidth, opts.borderWidth * 1.5]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(opts.text, x, y);
  ctx.restore();

  return resCanvas;
}

/**
 * Enhances thin text and fine line strokes (morphological thickening / dilation)
 * amount: 0 to 100
 * mode: 'dark' (for dark text on light bg) or 'light' (for light text on dark bg)
 */
export function applyStrokeBoldness(
  canvas: HTMLCanvasElement,
  amount: number,
  mode: 'dark' | 'light' = 'dark'
): HTMLCanvasElement {
  if (amount <= 0) return canvas;

  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const src = new Uint8ClampedArray(data);

  const factor = Math.min(1.0, (amount / 100) * 0.85);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      const a = src[idx + 3];

      if (a < 10) continue;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Check 4-connected neighbors
      const nIdxs = [
        ((y - 1) * w + x) * 4,
        ((y + 1) * w + x) * 4,
        (y * w + (x - 1)) * 4,
        (y * w + (x + 1)) * 4
      ];

      let targetR = r;
      let targetG = g;
      let targetB = b;
      let extremeLum = lum;

      for (let i = 0; i < 4; i++) {
        const ni = nIdxs[i];
        const nr = src[ni];
        const ng = src[ni + 1];
        const nb = src[ni + 2];
        const nLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

        if (mode === 'dark') {
          if (nLum < extremeLum) {
            extremeLum = nLum;
            targetR = nr;
            targetG = ng;
            targetB = nb;
          }
        } else {
          if (nLum > extremeLum) {
            extremeLum = nLum;
            targetR = nr;
            targetG = ng;
            targetB = nb;
          }
        }
      }

      if (mode === 'dark' && extremeLum < lum) {
        data[idx] = Math.round(r * (1 - factor) + targetR * factor);
        data[idx + 1] = Math.round(g * (1 - factor) + targetG * factor);
        data[idx + 2] = Math.round(b * (1 - factor) + targetB * factor);
      } else if (mode === 'light' && extremeLum > lum) {
        data[idx] = Math.round(r * (1 - factor) + targetR * factor);
        data[idx + 1] = Math.round(g * (1 - factor) + targetG * factor);
        data[idx + 2] = Math.round(b * (1 - factor) + targetB * factor);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return resCanvas;
}

/**
 * Generates a 256-entry lookup table for tone curves based on 5 control points:
 * blacks (input 0), shadows (input 64), midtones (input 128), highlights (input 192), whites (input 255)
 */
export function generateToneCurveLUT(
  blackPoint: number, // 0 to 50
  shadows: number,    // -100 to +100
  midtones: number,   // -100 to +100
  highlights: number, // -100 to +100
  whitePoint: number  // 200 to 255
): Uint8Array {
  const lut = new Uint8Array(256);

  const p0 = { x: 0, y: Math.max(0, Math.min(255, blackPoint)) };
  const p1 = { x: 64, y: Math.max(0, Math.min(255, 64 + (shadows * 0.6))) };
  const p2 = { x: 128, y: Math.max(0, Math.min(255, 128 + (midtones * 0.6))) };
  const p3 = { x: 192, y: Math.max(0, Math.min(255, 192 + (highlights * 0.6))) };
  const p4 = { x: 255, y: Math.max(0, Math.min(255, whitePoint)) };

  const points = [p0, p1, p2, p3, p4];

  for (let i = 0; i < 256; i++) {
    let seg = 0;
    while (seg < points.length - 2 && points[seg + 1].x < i) {
      seg++;
    }

    const pA = seg > 0 ? points[seg - 1] : points[seg];
    const pB = points[seg];
    const pC = points[seg + 1];
    const pD = seg + 2 < points.length ? points[seg + 2] : points[seg + 1];

    const t = Math.max(0, Math.min(1, (i - pB.x) / (pC.x - pB.x)));
    const t2 = t * t;
    const t3 = t2 * t;

    const y = 0.5 * (
      (2 * pB.y) +
      (-pA.y + pC.y) * t +
      (2 * pA.y - 5 * pB.y + 4 * pC.y - pD.y) * t2 +
      (-pA.y + 3 * pB.y - 3 * pC.y + pD.y) * t3
    );

    lut[i] = Math.max(0, Math.min(255, Math.round(y)));
  }

  return lut;
}

/**
 * Applies a 256-entry lookup table tone curve to an HTMLCanvasElement
 */
export function applyToneCurves(
  canvas: HTMLCanvasElement,
  lut: Uint8Array
): HTMLCanvasElement {
  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, resCanvas.width, resCanvas.height);
  const data = imgData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    data[i] = lut[data[i]];         // Red
    data[i + 1] = lut[data[i + 1]]; // Green
    data[i + 2] = lut[data[i + 2]]; // Blue
    // data[i+3] is Alpha (preserved)
  }

  ctx.putImageData(imgData, 0, 0);
  return resCanvas;
}

export interface BackgroundColorOptions {
  targetColor: string; // Hex '#ffffff'
  tolerance: number;   // 0 to 100%
  smoothness: number;  // 0 to 30 (edge feathering)
  contiguous: boolean; // true = only connected from image borders, false = global
  replaceMode: 'transparent' | 'replace';
  newColor?: string;   // Hex replacement if replaceMode === 'replace'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16)
    };
  }
  return {
    r: parseInt(clean.substring(0, 2), 16) || 0,
    g: parseInt(clean.substring(2, 4), 16) || 0,
    b: parseInt(clean.substring(4, 6), 16) || 0
  };
}

/**
 * Adjusts background color: makes target color (e.g. white #ffffff) transparent
 * or replaces it with another color. Supports flood fill (contiguous) and edge smoothing.
 */
export function applyBackgroundColorAdjustment(
  canvas: HTMLCanvasElement,
  options: BackgroundColorOptions
): HTMLCanvasElement {
  const resCanvas = document.createElement('canvas');
  resCanvas.width = canvas.width;
  resCanvas.height = canvas.height;
  const ctx = resCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(canvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, resCanvas.width, resCanvas.height);
  const data = imgData.data;
  const { width, height } = resCanvas;

  const target = hexToRgb(options.targetColor);
  const newRgb = options.replaceMode === 'replace' && options.newColor ? hexToRgb(options.newColor) : null;
  const tol = Math.max(0, Math.min(100, options.tolerance));
  const smooth = Math.max(0, Math.min(50, options.smoothness));

  // Max color distance is sqrt(255^2 * 3) ~= 441.67
  const maxDist = 441.673;

  const getColorDistPct = (r: number, g: number, b: number) => {
    const dr = r - target.r;
    const dg = g - target.g;
    const db = b - target.b;
    return (Math.sqrt(dr * dr + dg * dg + db * db) / maxDist) * 100;
  };

  if (options.contiguous) {
    // Flood fill from edges
    const visited = new Uint8Array(width * height);
    const queue: number[] = [];

    // Seed edge pixels that match within tolerance
    for (let x = 0; x < width; x++) {
      const topIdx = x;
      const bottomIdx = (height - 1) * width + x;
      const topP = topIdx * 4;
      const botP = bottomIdx * 4;

      if (getColorDistPct(data[topP], data[topP + 1], data[topP + 2]) <= tol) {
        visited[topIdx] = 1;
        queue.push(topIdx);
      }
      if (getColorDistPct(data[botP], data[botP + 1], data[botP + 2]) <= tol) {
        visited[bottomIdx] = 1;
        queue.push(bottomIdx);
      }
    }

    for (let y = 0; y < height; y++) {
      const leftIdx = y * width;
      const rightIdx = y * width + (width - 1);
      const leftP = leftIdx * 4;
      const rightP = rightIdx * 4;

      if (!visited[leftIdx] && getColorDistPct(data[leftP], data[leftP + 1], data[leftP + 2]) <= tol) {
        visited[leftIdx] = 1;
        queue.push(leftIdx);
      }
      if (!visited[rightIdx] && getColorDistPct(data[rightP], data[rightP + 1], data[rightP + 2]) <= tol) {
        visited[rightIdx] = 1;
        queue.push(rightIdx);
      }
    }

    // BFS
    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = Math.floor(curr / width);

      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1
      ];

      for (let i = 0; i < 4; i++) {
        const n = neighbors[i];
        if (n !== -1 && !visited[n]) {
          const p = n * 4;
          if (getColorDistPct(data[p], data[p + 1], data[p + 2]) <= tol) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    }

    // Now apply alpha or replacement to visited pixels
    for (let i = 0; i < width * height; i++) {
      if (visited[i]) {
        const p = i * 4;
        const dist = getColorDistPct(data[p], data[p + 1], data[p + 2]);
        let factor = 0; // 0 = completely transparent / replaced

        if (smooth > 0 && dist > Math.max(0, tol - smooth)) {
          factor = (dist - (tol - smooth)) / smooth;
        }

        if (options.replaceMode === 'transparent') {
          data[p + 3] = Math.round(data[p + 3] * factor);
        } else if (newRgb) {
          data[p] = Math.round(newRgb.r * (1 - factor) + data[p] * factor);
          data[p + 1] = Math.round(newRgb.g * (1 - factor) + data[p + 1] * factor);
          data[p + 2] = Math.round(newRgb.b * (1 - factor) + data[p + 2] * factor);
        }
      }
    }
  } else {
    // Global replacement for all pixels
    const totalPixels = width * height;
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      const dist = getColorDistPct(data[p], data[p + 1], data[p + 2]);

      if (dist <= tol) {
        let factor = 0;
        if (smooth > 0 && dist > Math.max(0, tol - smooth)) {
          factor = (dist - (tol - smooth)) / smooth;
        }

        if (options.replaceMode === 'transparent') {
          data[p + 3] = Math.round(data[p + 3] * factor);
        } else if (newRgb) {
          data[p] = Math.round(newRgb.r * (1 - factor) + data[p] * factor);
          data[p + 1] = Math.round(newRgb.g * (1 - factor) + data[p + 1] * factor);
          data[p + 2] = Math.round(newRgb.b * (1 - factor) + data[p + 2] * factor);
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return resCanvas;
}

