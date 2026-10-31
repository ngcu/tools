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

export interface Point2D {
  x: number;
  y: number;
}

export interface QuadPoints {
  tl: Point2D;
  tr: Point2D;
  br: Point2D;
  bl: Point2D;
}

export interface TransformOptions {
  mode: 'crop' | 'distort' | 'perspective' | 'skew';
  quad?: QuadPoints;
  skewX?: number; // degrees (-45 to 45)
  skewY?: number; // degrees (-45 to 45)
  bgMode?: 'transparent' | 'white' | 'black';
  autoFitBounds?: boolean;
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
 * Natural text/stroke thickening filter (morphological dark stroke dilation)
 * Enhances thin text or faint strokes naturally without excessive blur.
 */
export function applyTextStrokeThicken(canvas: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  if (strength <= 0) return canvas;

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
  const copy = new Uint8ClampedArray(data);

  const radius = strength >= 2 ? 2 : 1;
  const isSubtle = strength < 1;
  const blendFactor = isSubtle ? 0.32 : Math.min(0.9, 0.45 + strength * 0.2);
  const diffThreshold = isSubtle ? 22 : 18;

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      const centerIdx = (y * w + x) * 4;
      const centerLum = 0.299 * copy[centerIdx] + 0.587 * copy[centerIdx + 1] + 0.114 * copy[centerIdx + 2];

      let minLum = centerLum;
      let minR = copy[centerIdx];
      let minG = copy[centerIdx + 1];
      let minB = copy[centerIdx + 2];

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          // 0.5단계 미세 볼드: 대각선 제외 상하좌우 4방향만 체크
          if (isSubtle && dx !== 0 && dy !== 0) continue;

          const nIdx = ((y + dy) * w + (x + dx)) * 4;
          const lum = 0.299 * copy[nIdx] + 0.587 * copy[nIdx + 1] + 0.114 * copy[nIdx + 2];
          if (lum < minLum) {
            minLum = lum;
            minR = copy[nIdx];
            minG = copy[nIdx + 1];
            minB = copy[nIdx + 2];
          }
        }
      }

      if (minLum < 200 && (centerLum - minLum) > diffThreshold) {
        data[centerIdx] = Math.round(copy[centerIdx] * (1 - blendFactor) + minR * blendFactor);
        data[centerIdx + 1] = Math.round(copy[centerIdx + 1] * (1 - blendFactor) + minG * blendFactor);
        data[centerIdx + 2] = Math.round(copy[centerIdx + 2] * (1 - blendFactor) + minB * blendFactor);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return resCanvas;
}

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
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const metrics = ctx.measureText(opts.text);
  const textW = metrics.width;
  const textH = opts.fontSize;
  const lineH = opts.fontSize * 1.2;
  const hasDecor = Boolean(opts.hasBackground || (opts.borderWidth && opts.borderWidth > 0));
  const padX = hasDecor ? 8 : 0;
  const padY = hasDecor ? 4 : 0;
  const boxW = textW + padX * 2;
  const boxH = lineH + padY * 2;
  const pad = 20;

  let boxX = pad;
  let boxY = pad;

  switch (opts.position) {
    case 'center':
      boxX = (canvas.width - boxW) / 2;
      boxY = (canvas.height - boxH) / 2;
      break;
    case 'top-left':
      boxX = pad;
      boxY = pad;
      break;
    case 'top-right':
      boxX = canvas.width - boxW - pad;
      boxY = pad;
      break;
    case 'bottom-left':
      boxX = pad;
      boxY = canvas.height - boxH - pad;
      break;
    case 'bottom-right':
      boxX = canvas.width - boxW - pad;
      boxY = canvas.height - boxH - pad;
      break;
    case 'custom':
      boxX = opts.customX ?? pad;
      boxY = opts.customY ?? pad;
      break;
  }

  if (hasDecor) {
    const rad = Math.min(opts.backgroundRadius || 0, Math.min(boxW, boxH) / 2);

    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(boxX, boxY, boxW, boxH, rad);
    } else {
      ctx.rect(boxX, boxY, boxW, boxH);
    }

    if (opts.hasBackground && opts.backgroundColor && opts.backgroundColor !== 'transparent') {
      ctx.fillStyle = opts.backgroundColor;
      ctx.fill();
    }

    if (opts.borderWidth && opts.borderWidth > 0) {
      ctx.lineWidth = opts.borderWidth;
      ctx.strokeStyle = opts.borderColor || '#ffffff';
      if (opts.borderStyle === 'dotted') {
        ctx.lineCap = 'round';
        ctx.setLineDash([1, Math.max(4, opts.borderWidth * 2.2)]);
      } else if (opts.borderStyle === 'dashed') {
        ctx.lineCap = 'butt';
        ctx.setLineDash([Math.max(6, opts.borderWidth * 3), Math.max(4, opts.borderWidth * 2)]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const textX = boxX + padX;
  const textY = boxY + padY + (lineH - textH) / 2;
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(opts.text, textX, textY);
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

  const p0 = { x: 0, y: blackPoint * 0.8 };
  const p1 = { x: 64, y: 64 + (shadows * 0.8) };
  const p2 = { x: 128, y: 128 + (midtones * 0.8) };
  const p3 = { x: 192, y: 192 + (highlights * 0.8) };
  const p4 = { x: 255, y: 255 + ((whitePoint - 255) * 0.8) };

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

/**
 * Solves 3x3 homography matrix H (with H[8] = 1) such that dst ~ H * src.
 * src and dst must each contain exactly 4 points: [tl, tr, br, bl].
 */
export function solveHomography(src: Point2D[], dst: Point2D[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    B.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dy);
  }

  // Gauss-Jordan elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(A[maxRow][i]) < 1e-12) return null; // Singular matrix

    // Swap rows
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [B[i], B[maxRow]] = [B[maxRow], B[i]];

    // Scale pivot row
    const pivot = A[i][i];
    for (let j = i; j < n; j++) {
      A[i][j] /= pivot;
    }
    B[i] /= pivot;

    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = A[k][i];
      if (Math.abs(factor) > 1e-12) {
        for (let j = i; j < n; j++) {
          A[k][j] -= factor * A[i][j];
        }
        B[k] -= factor * B[i];
      }
    }
  }

  const h = new Array(9);
  for (let i = 0; i < 8; i++) {
    h[i] = B[i];
  }
  h[8] = 1;
  return h;
}

/**
 * Bilinear sampling from source ImageData.
 * Returns true if sampled within bounds.
 */
function sampleBilinear(
  srcData: Uint8ClampedArray,
  sw: number,
  sh: number,
  x: number,
  y: number,
  out: Uint8ClampedArray
): boolean {
  if (x < 0 || x > sw - 1 || y < 0 || y > sh - 1) {
    return false;
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, sw - 1);
  const y1 = Math.min(y0 + 1, sh - 1);

  const fx = x - x0;
  const fy = y - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const idx00 = (y0 * sw + x0) * 4;
  const idx10 = (y0 * sw + x1) * 4;
  const idx01 = (y1 * sw + x0) * 4;
  const idx11 = (y1 * sw + x1) * 4;

  out[0] = Math.round(srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11);
  out[1] = Math.round(srcData[idx00 + 1] * w00 + srcData[idx10 + 1] * w10 + srcData[idx01 + 1] * w01 + srcData[idx11 + 1] * w11);
  out[2] = Math.round(srcData[idx00 + 2] * w00 + srcData[idx10 + 2] * w10 + srcData[idx01 + 2] * w01 + srcData[idx11 + 2] * w11);
  out[3] = Math.round(srcData[idx00 + 3] * w00 + srcData[idx10 + 3] * w10 + srcData[idx01 + 3] * w01 + srcData[idx11 + 3] * w11);
  return true;
}

/**
 * Perspective Crop (원근 자르기):
 * Straightens a tilted quadrangle (e.g. document scan, billboard) into an upright rectangular canvas.
 */
export function applyPerspectiveCrop(
  canvas: HTMLCanvasElement,
  quad: QuadPoints,
  options?: { outputWidth?: number; outputHeight?: number; bgMode?: 'transparent' | 'white' | 'black' }
): HTMLCanvasElement {
  const srcCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx || canvas.width <= 0 || canvas.height <= 0) return cloneCanvas(canvas);

  const { tl, tr, br, bl } = quad;

  // Calculate default dimensions based on edge lengths
  const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

  const outW = Math.max(1, Math.round(options?.outputWidth || Math.max(topW, botW)));
  const outH = Math.max(1, Math.round(options?.outputHeight || Math.max(leftH, rightH)));

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
  if (!dstCtx) return cloneCanvas(canvas);

  const bgMode = options?.bgMode || 'transparent';
  if (bgMode === 'white') {
    dstCtx.fillStyle = '#ffffff';
    dstCtx.fillRect(0, 0, outW, outH);
  } else if (bgMode === 'black') {
    dstCtx.fillStyle = '#000000';
    dstCtx.fillRect(0, 0, outW, outH);
  }

  // Inverse mapping: from dst rectangle to src quad
  const dstPoints: Point2D[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 }
  ];
  const srcPoints: Point2D[] = [tl, tr, br, bl];

  const H_inv = solveHomography(dstPoints, srcPoints);
  if (!H_inv) return cloneCanvas(canvas);

  const srcImg = srcCtx.getImageData(0, 0, canvas.width, canvas.height);
  const dstImg = dstCtx.getImageData(0, 0, outW, outH);
  const srcData = srcImg.data;
  const dstData = dstImg.data;
  const sw = canvas.width;
  const sh = canvas.height;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = H_inv;
  const sampleColor = new Uint8ClampedArray(4);

  for (let dy = 0; dy < outH; dy++) {
    const rowOffset = dy * outW * 4;
    for (let dx = 0; dx < outW; dx++) {
      const w = h6 * dx + h7 * dy + 1;
      if (Math.abs(w) < 1e-10) continue;
      const invW = 1 / w;
      const sx = (h0 * dx + h1 * dy + h2) * invW;
      const sy = (h3 * dx + h4 * dy + h5) * invW;

      if (sampleBilinear(srcData, sw, sh, sx, sy, sampleColor)) {
        const p = rowOffset + dx * 4;
        if (bgMode === 'transparent' || sampleColor[3] === 255) {
          dstData[p] = sampleColor[0];
          dstData[p + 1] = sampleColor[1];
          dstData[p + 2] = sampleColor[2];
          dstData[p + 3] = sampleColor[3];
        } else {
          const a = sampleColor[3] / 255;
          const bgVal = bgMode === 'white' ? 255 : 0;
          dstData[p] = Math.round(sampleColor[0] * a + bgVal * (1 - a));
          dstData[p + 1] = Math.round(sampleColor[1] * a + bgVal * (1 - a));
          dstData[p + 2] = Math.round(sampleColor[2] * a + bgVal * (1 - a));
          dstData[p + 3] = 255;
        }
      }
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
  return dstCanvas;
}

/**
 * Free Distort / Perspective Warp (왜곡 / 원근감):
 * Transforms the entire canvas into arbitrary quad coordinates.
 */
export function applyPerspectiveDistort(
  canvas: HTMLCanvasElement,
  quad: QuadPoints,
  options?: { bgMode?: 'transparent' | 'white' | 'black'; autoFitBounds?: boolean }
): HTMLCanvasElement {
  const srcCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx || canvas.width <= 0 || canvas.height <= 0) return cloneCanvas(canvas);

  const sw = canvas.width;
  const sh = canvas.height;
  const bgMode = options?.bgMode || 'transparent';
  const autoFit = options?.autoFitBounds ?? false;

  const minX = Math.floor(Math.min(quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x));
  const maxX = Math.ceil(Math.max(quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x));
  const minY = Math.floor(Math.min(quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y));
  const maxY = Math.ceil(Math.max(quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y));

  const outW = autoFit ? Math.max(1, maxX - minX) : sw;
  const outH = autoFit ? Math.max(1, maxY - minY) : sh;
  const offsetX = autoFit ? minX : 0;
  const offsetY = autoFit ? minY : 0;

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const dstCtx = dstCanvas.getContext('2d', { willReadFrequently: true });
  if (!dstCtx) return cloneCanvas(canvas);

  if (bgMode === 'white') {
    dstCtx.fillStyle = '#ffffff';
    dstCtx.fillRect(0, 0, outW, outH);
  } else if (bgMode === 'black') {
    dstCtx.fillStyle = '#000000';
    dstCtx.fillRect(0, 0, outW, outH);
  }

  // Destination quad adjusted for canvas offset
  const dstQuad: Point2D[] = [
    { x: quad.tl.x - offsetX, y: quad.tl.y - offsetY },
    { x: quad.tr.x - offsetX, y: quad.tr.y - offsetY },
    { x: quad.br.x - offsetX, y: quad.br.y - offsetY },
    { x: quad.bl.x - offsetX, y: quad.bl.y - offsetY }
  ];

  // Source original quad corners
  const srcQuad: Point2D[] = [
    { x: 0, y: 0 },
    { x: sw - 1, y: 0 },
    { x: sw - 1, y: sh - 1 },
    { x: 0, y: sh - 1 }
  ];

  // Inverse mapping: from dst quad coordinates to src canvas
  const H_inv = solveHomography(dstQuad, srcQuad);
  if (!H_inv) return cloneCanvas(canvas);

  const srcImg = srcCtx.getImageData(0, 0, sw, sh);
  const dstImg = dstCtx.getImageData(0, 0, outW, outH);
  const srcData = srcImg.data;
  const dstData = dstImg.data;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = H_inv;
  const sampleColor = new Uint8ClampedArray(4);

  // Scan bounding box of dst quad in output coordinates
  const bbMinX = Math.max(0, Math.floor(Math.min(...dstQuad.map(p => p.x))));
  const bbMaxX = Math.min(outW - 1, Math.ceil(Math.max(...dstQuad.map(p => p.x))));
  const bbMinY = Math.max(0, Math.floor(Math.min(...dstQuad.map(p => p.y))));
  const bbMaxY = Math.min(outH - 1, Math.ceil(Math.max(...dstQuad.map(p => p.y))));

  for (let dy = bbMinY; dy <= bbMaxY; dy++) {
    const rowOffset = dy * outW * 4;
    for (let dx = bbMinX; dx <= bbMaxX; dx++) {
      const w = h6 * dx + h7 * dy + 1;
      if (Math.abs(w) < 1e-10) continue;
      const invW = 1 / w;
      const sx = (h0 * dx + h1 * dy + h2) * invW;
      const sy = (h3 * dx + h4 * dy + h5) * invW;

      if (sampleBilinear(srcData, sw, sh, sx, sy, sampleColor)) {
        const p = rowOffset + dx * 4;
        if (bgMode === 'transparent' || sampleColor[3] === 255) {
          dstData[p] = sampleColor[0];
          dstData[p + 1] = sampleColor[1];
          dstData[p + 2] = sampleColor[2];
          dstData[p + 3] = sampleColor[3];
        } else {
          const a = sampleColor[3] / 255;
          const bgVal = bgMode === 'white' ? 255 : 0;
          dstData[p] = Math.round(sampleColor[0] * a + bgVal * (1 - a));
          dstData[p + 1] = Math.round(sampleColor[1] * a + bgVal * (1 - a));
          dstData[p + 2] = Math.round(sampleColor[2] * a + bgVal * (1 - a));
          dstData[p + 3] = 255;
        }
      }
    }
  }

  dstCtx.putImageData(dstImg, 0, 0);
  return dstCanvas;
}

/**
 * Skew (기울이기):
 * Shears the canvas horizontally (skewX) and vertically (skewY).
 */
export function applySkew(
  canvas: HTMLCanvasElement,
  skewXDeg: number,
  skewYDeg: number,
  bgMode?: 'transparent' | 'white' | 'black'
): HTMLCanvasElement {
  if (skewXDeg === 0 && skewYDeg === 0) return cloneCanvas(canvas);

  const sw = canvas.width;
  const sh = canvas.height;
  const radX = (skewXDeg * Math.PI) / 180;
  const radY = (skewYDeg * Math.PI) / 180;
  const tanX = Math.tan(radX);
  const tanY = Math.tan(radY);

  // 4 corners after transform: x' = x + y * tanX, y' = y + x * tanY
  const corners: Point2D[] = [
    { x: 0, y: 0 },
    { x: sw, y: sw * tanY },
    { x: sw + sh * tanX, y: sh + sw * tanY },
    { x: sh * tanX, y: sh }
  ];

  const minX = Math.floor(Math.min(...corners.map(c => c.x)));
  const maxX = Math.ceil(Math.max(...corners.map(c => c.x)));
  const minY = Math.floor(Math.min(...corners.map(c => c.y)));
  const maxY = Math.ceil(Math.max(...corners.map(c => c.y)));

  const outW = Math.max(1, maxX - minX);
  const outH = Math.max(1, maxY - minY);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = outW;
  dstCanvas.height = outH;
  const ctx = dstCanvas.getContext('2d');
  if (!ctx) return cloneCanvas(canvas);

  const bg = bgMode || 'transparent';
  if (bg === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  } else if (bg === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outW, outH);
  }

  ctx.save();
  ctx.translate(-minX, -minY);
  ctx.transform(1, tanY, tanX, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();

  return dstCanvas;
}


