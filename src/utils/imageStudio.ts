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
 * Rotates canvas by 90/180/270 degrees and/or flips horizontally/vertically
 */
export function applyRotationAndFlip(
  canvas: HTMLCanvasElement,
  angleDeg: number, // 0, 90, 180, 270
  flipH: boolean,
  flipV: boolean
): HTMLCanvasElement {
  const normAngle = ((angleDeg % 360) + 360) % 360;
  const isSwap = normAngle === 90 || normAngle === 270;

  const resCanvas = document.createElement('canvas');
  resCanvas.width = isSwap ? canvas.height : canvas.width;
  resCanvas.height = isSwap ? canvas.width : canvas.height;

  const ctx = resCanvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.translate(resCanvas.width / 2, resCanvas.height / 2);
  ctx.rotate((normAngle * Math.PI) / 180);
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
      ctx.stroke();
    }
  }

  ctx.fillStyle = opts.color || '#ffffff';
  ctx.fillText(opts.text, x, y);
  ctx.restore();

  return resCanvas;
}
