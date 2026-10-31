import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Crop as CropIcon,
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ZoomIn,
  Maximize2,
  FileImage,
  Layers,
  ArrowRight,
  Info,
  CheckCircle2,
  RotateCcw,
  Scissors
} from 'lucide-react';
import {
  CropRect,
  detectAutoCropBounds,
  cropImageToBlob,
  copyImageBlobToClipboard,
  formatBytes,
  AutoCropResult
} from '../utils/imageCropper';

type AspectRatioMode = 'free' | '1:1' | '4:3' | '16:9' | 'original';

export const ImageCropView: React.FC = () => {
  // Image Source
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Crop Coordinates (in natural image pixel coordinates)
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [autoCropResult, setAutoCropResult] = useState<AutoCropResult | null>(null);

  // Settings
  const [tolerance, setTolerance] = useState<number>(18);
  const [aspectMode, setAspectMode] = useState<AspectRatioMode>('free');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = useState<number>(0.92);

  // Status & Feedback
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Viewport & Canvas references
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dragging & Resizing interaction state
  const [interactionMode, setInteractionMode] = useState<
    'none' | 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  >('none');
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    initialRect: CropRect;
  } | null>(null);

  // 1. Load Image from File
  const handleLoadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(PNG, JPG, WEBP 등)만 업로드할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImageFile(file);
        setImageSrc(src);
        setImgNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });

        // Offscreen canvas to compute Auto Crop immediately
        const offCanvas = document.createElement('canvas');
        offCanvas.width = img.naturalWidth;
        offCanvas.height = img.naturalHeight;
        const ctx = offCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const autoRes = detectAutoCropBounds(offCanvas, { tolerance: 18 });
          setAutoCropResult(autoRes);
          setCropRect(autoRes.rect);
        } else {
          setCropRect({ x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  // 2. Clipboard Paste Handler (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleLoadFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleLoadFile]);

  // 3. Re-run Auto Crop calculation
  const handleRecalculateAutoCrop = useCallback((tol = tolerance) => {
    if (!imageRef.current || imgNaturalSize.width === 0) return;
    setIsProcessing(true);

    try {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = imgNaturalSize.width;
      offCanvas.height = imgNaturalSize.height;
      const ctx = offCanvas.getContext('2d');
      if (ctx && imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0);
        const autoRes = detectAutoCropBounds(offCanvas, { tolerance: tol });
        setAutoCropResult(autoRes);
        setCropRect(autoRes.rect);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [tolerance, imgNaturalSize]);

  // Reset to full original image
  const handleResetToFull = () => {
    setCropRect({
      x: 0,
      y: 0,
      width: imgNaturalSize.width,
      height: imgNaturalSize.height
    });
  };

  // 4. Pointer Events for Interactive Crop Box & Handles
  const handlePointerDown = (
    mode: 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();

    setInteractionMode(mode);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialRect: { ...cropRect }
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (interactionMode === 'none' || !dragStartRef.current || !imageRef.current) return;

    // Convert display client movement delta to natural image pixel delta
    const imgEl = imageRef.current;
    const rect = imgEl.getBoundingClientRect();
    const scaleX = imgNaturalSize.width / Math.max(1, rect.width);
    const scaleY = imgNaturalSize.height / Math.max(1, rect.height);

    const deltaX = (e.clientX - dragStartRef.current.pointerX) * scaleX;
    const deltaY = (e.clientY - dragStartRef.current.pointerY) * scaleY;

    const { initialRect } = dragStartRef.current;
    let nextX = initialRect.x;
    let nextY = initialRect.y;
    let nextW = initialRect.width;
    let nextH = initialRect.height;

    const minSize = 10; // minimum 10px

    if (interactionMode === 'move') {
      nextX = Math.max(0, Math.min(imgNaturalSize.width - initialRect.width, initialRect.x + deltaX));
      nextY = Math.max(0, Math.min(imgNaturalSize.height - initialRect.height, initialRect.y + deltaY));
    } else {
      // East / West
      if (interactionMode.includes('e')) {
        nextW = Math.max(minSize, Math.min(imgNaturalSize.width - initialRect.x, initialRect.width + deltaX));
      }
      if (interactionMode.includes('w')) {
        const potentialW = initialRect.width - deltaX;
        if (potentialW >= minSize) {
          const maxShift = initialRect.x + initialRect.width - minSize;
          nextX = Math.max(0, Math.min(maxShift, initialRect.x + deltaX));
          nextW = initialRect.x + initialRect.width - nextX;
        }
      }

      // North / South
      if (interactionMode.includes('s')) {
        nextH = Math.max(minSize, Math.min(imgNaturalSize.height - initialRect.y, initialRect.height + deltaY));
      }
      if (interactionMode.includes('n')) {
        const potentialH = initialRect.height - deltaY;
        if (potentialH >= minSize) {
          const maxShift = initialRect.y + initialRect.height - minSize;
          nextY = Math.max(0, Math.min(maxShift, initialRect.y + deltaY));
          nextH = initialRect.y + initialRect.height - nextY;
        }
      }

      // Enforce aspect ratio preset if selected
      if (aspectMode !== 'free') {
        let targetRatio = 1;
        if (aspectMode === '1:1') targetRatio = 1;
        else if (aspectMode === '4:3') targetRatio = 4 / 3;
        else if (aspectMode === '16:9') targetRatio = 16 / 9;
        else if (aspectMode === 'original') targetRatio = imgNaturalSize.width / Math.max(1, imgNaturalSize.height);

        // Adjust height based on width
        if (interactionMode === 'e' || interactionMode === 'w') {
          nextH = nextW / targetRatio;
        } else if (interactionMode === 's' || interactionMode === 'n') {
          nextW = nextH * targetRatio;
        }
      }
    }

    setCropRect({
      x: Math.round(Math.max(0, nextX)),
      y: Math.round(Math.max(0, nextY)),
      width: Math.round(Math.min(imgNaturalSize.width - nextX, nextW)),
      height: Math.round(Math.min(imgNaturalSize.height - nextY, nextH))
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (interactionMode !== 'none') {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setInteractionMode('none');
      dragStartRef.current = null;
    }
  };

  // 5. Download Cropped Image
  const handleDownload = async () => {
    if (!imageRef.current) return;
    try {
      setIsProcessing(true);
      const { blob } = await cropImageToBlob(imageRef.current, cropRect, exportFormat, exportQuality);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const originalName = imageFile?.name.replace(/\.[^/.]+$/, '') || 'cropped_image';
      a.download = `${originalName}_cropped.${exportFormat}`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('이미지 크롭 및 저장 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 6. Copy to Clipboard
  const handleCopyClipboard = async () => {
    if (!imageRef.current) return;
    try {
      setIsProcessing(true);
      const success = await copyImageBlobToClipboard(imageRef.current, cropRect);
      if (success) {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } else {
        alert('이 브라우저는 클립보드 이미지 복사를 지원하지 않거나 권한이 제한되었습니다. 다운로드 버튼을 이용해주세요.');
      }
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate percentage coordinates for DOM positioning
  const leftPct = imgNaturalSize.width > 0 ? (cropRect.x / imgNaturalSize.width) * 100 : 0;
  const topPct = imgNaturalSize.height > 0 ? (cropRect.y / imgNaturalSize.height) * 100 : 0;
  const widthPct = imgNaturalSize.width > 0 ? (cropRect.width / imgNaturalSize.width) * 100 : 100;
  const heightPct = imgNaturalSize.height > 0 ? (cropRect.height / imgNaturalSize.height) * 100 : 100;

  // Saved pixel reduction percentage
  const originalArea = imgNaturalSize.width * imgNaturalSize.height;
  const croppedArea = cropRect.width * cropRect.height;
  const reductionPct = originalArea > 0 ? Math.round((1 - croppedArea / originalArea) * 100) : 0;

  return (
    <div className="w-full space-y-4">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleLoadFile(e.target.files[0]);
          }
        }}
        accept="image/*"
        className="hidden"
      />

      {/* Top Action Bar - Only when image is loaded */}
      {imageSrc && (
        <div className="flex items-center justify-end gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-sm">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FileImage className="w-3.5 h-3.5 text-indigo-400" />
            <span>다른 이미지 열기</span>
          </button>
        </div>
      )}

      {/* Zero State: Drag & Drop Upload Zone */}
      {!imageSrc ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleLoadFile(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-6 sm:p-10 w-full h-[calc(100vh-125px)] md:h-[calc(100vh-72px)] min-h-[420px] flex items-center justify-center text-center cursor-pointer transition-all duration-300 group ${
            isDraggingFile
              ? 'border-indigo-400 bg-indigo-950/40 scale-[1.01]'
              : 'border-slate-700/80 bg-slate-900/50 hover:border-indigo-500/60 hover:bg-slate-900/80 shadow-2xl'
          }`}
        >
          <div className="max-w-md mx-auto flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-bold text-white">
                크롭할 이미지를 끌어다 놓으세요
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                클릭하여 파일 찾기 또는 화면 어디서든 <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-indigo-300">Ctrl+V</kbd> 로 붙여넣기
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-slate-400">
              <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700">PNG</span>
              <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700">JPG/JPEG</span>
              <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700">WEBP</span>
              <span className="px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700">투명 배경 지원</span>
            </div>
          </div>
        </div>
      ) : (
        /* Workspace Layout: Viewport (Left/Top) + Control Panels (Right/Bottom) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* ========================================================================= */}
          {/* LEFT: Interactive Viewport with 8-Way Resize Handles (lg:col-span-8)       */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 space-y-3">
            <div
              ref={viewportRef}
              className="relative rounded-2xl bg-slate-950/80 border border-slate-800 shadow-2xl overflow-hidden p-3 sm:p-6 flex items-center justify-center min-h-[380px] max-h-[72vh] select-none"
            >
              {/* Checkerboard background for transparency preview */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(45deg, #475569 25%, transparent 25%), linear-gradient(-45deg, #475569 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #475569 75%), linear-gradient(-45deg, transparent 75%, #475569 75%)`,
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                }}
              />

              {/* Main Image Container */}
              <div className="relative inline-block max-w-full max-h-[65vh]">
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Crop Source"
                  className="block max-w-full max-h-[65vh] object-contain pointer-events-none rounded shadow"
                />

                {/* =============================================================== */}
                {/* DIMMED MASK OVERLAY (Hides area outside crop rectangle)          */}
                {/* =============================================================== */}
                {/* Top Mask */}
                <div
                  className="absolute left-0 right-0 top-0 bg-slate-950/75 pointer-events-none transition-[height] duration-75"
                  style={{ height: `${topPct}%` }}
                />
                {/* Bottom Mask */}
                <div
                  className="absolute left-0 right-0 bottom-0 bg-slate-950/75 pointer-events-none transition-[height] duration-75"
                  style={{ height: `${100 - (topPct + heightPct)}%` }}
                />
                {/* Left Mask */}
                <div
                  className="absolute left-0 bg-slate-950/75 pointer-events-none transition-[top,height,width] duration-75"
                  style={{
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    width: `${leftPct}%`
                  }}
                />
                {/* Right Mask */}
                <div
                  className="absolute right-0 bg-slate-950/75 pointer-events-none transition-[top,height,width] duration-75"
                  style={{
                    top: `${topPct}%`,
                    height: `${heightPct}%`,
                    width: `${100 - (leftPct + widthPct)}%`
                  }}
                />

                {/* =============================================================== */}
                {/* INTERACTIVE CROP BOX                                            */}
                {/* =============================================================== */}
                <div
                  onPointerDown={(e) => handlePointerDown('move', e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="absolute border-2 border-indigo-400 shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_0_16px_rgba(99,102,241,0.3)] cursor-move touch-none group"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`
                  }}
                >
                  {/* Subtle 3x3 Grid Overlay */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity">
                    <div className="border-r border-b border-indigo-300/40" />
                    <div className="border-r border-b border-indigo-300/40" />
                    <div className="border-b border-indigo-300/40" />
                    <div className="border-r border-b border-indigo-300/40" />
                    <div className="border-r border-b border-indigo-300/40" />
                    <div className="border-b border-indigo-300/40" />
                    <div className="border-r border-indigo-300/40" />
                    <div className="border-r border-indigo-300/40" />
                    <div />
                  </div>

                  {/* Dimension Tooltip Badge */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-md bg-slate-950/90 text-xs font-mono text-indigo-200 border border-indigo-500/30 whitespace-nowrap pointer-events-none shadow-md z-30 flex items-center gap-1.5">
                    <span>{cropRect.width} × {cropRect.height} px</span>
                    {reductionPct > 0 && (
                      <span className="text-emerald-400 font-semibold">(-{reductionPct}%)</span>
                    )}
                  </div>

                  {/* ============================================================= */}
                  {/* 8-WAY RESIZE HANDLES                                          */}
                  {/* ============================================================= */}
                  {/* North-West (Top-Left) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('nw', e)}
                    className="absolute -top-2 -left-2 w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 cursor-nw-resize z-20 shadow hover:scale-125 transition-transform"
                  />
                  {/* North (Top) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('n', e)}
                    className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-3 rounded-full bg-white border-2 border-indigo-600 cursor-n-resize z-20 shadow hover:scale-110 transition-transform"
                  />
                  {/* North-East (Top-Right) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('ne', e)}
                    className="absolute -top-2 -right-2 w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 cursor-ne-resize z-20 shadow hover:scale-125 transition-transform"
                  />
                  {/* East (Right) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('e', e)}
                    className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-6 rounded-full bg-white border-2 border-indigo-600 cursor-e-resize z-20 shadow hover:scale-110 transition-transform"
                  />
                  {/* South-East (Bottom-Right) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('se', e)}
                    className="absolute -bottom-2 -right-2 w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 cursor-se-resize z-20 shadow hover:scale-125 transition-transform"
                  />
                  {/* South (Bottom) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('s', e)}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-3 rounded-full bg-white border-2 border-indigo-600 cursor-s-resize z-20 shadow hover:scale-110 transition-transform"
                  />
                  {/* South-West (Bottom-Left) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('sw', e)}
                    className="absolute -bottom-2 -left-2 w-4 h-4 rounded-sm bg-white border-2 border-indigo-600 cursor-sw-resize z-20 shadow hover:scale-125 transition-transform"
                  />
                  {/* West (Left) */}
                  <div
                    onPointerDown={(e) => handlePointerDown('w', e)}
                    className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-6 rounded-full bg-white border-2 border-indigo-600 cursor-w-resize z-20 shadow hover:scale-110 transition-transform"
                  />
                </div>
              </div>
            </div>

            {/* Quick Actions Under Viewport */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-mono text-sm">
                <span>원본: {imgNaturalSize.width} × {imgNaturalSize.height} px</span>
                <span>•</span>
                <span>크롭: <strong className="text-white">{cropRect.width} × {cropRect.height} px</strong></span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleRecalculateAutoCrop(tolerance)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-medium border border-indigo-500/30 transition flex items-center gap-1 cursor-pointer"
                  title="외곽 여백 재감지"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto Crop 재감지</span>
                </button>
                <button
                  onClick={handleResetToFull}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                  title="원본 전체 크기로 복원"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>전체 선택</span>
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT: Two-Step Control Panel (lg:col-span-4)                              */}
          {/* ========================================================================= */}
          <div className="lg:col-span-4 space-y-3.5">
            {/* Step 1: Auto Crop Control Card */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                    1
                  </span>
                  <h3 className="font-bold text-white text-sm">Auto Crop (자동 여백 자르기)</h3>
                </div>
                {autoCropResult && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    감지됨
                  </span>
                )}
              </div>

              {/* Background Color info & Sensitivity Slider */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-200 text-sm">
                  <span className="text-slate-400">감지된 외곽 여백 색상:</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    {autoCropResult?.detectedBg.isTransparent ? (
                      <span className="text-amber-300">투명 배경 (Alpha 0)</span>
                    ) : (
                      <>
                        <span
                          className="w-3.5 h-3.5 rounded border border-slate-600 shadow-sm"
                          style={{
                            backgroundColor: `rgb(${autoCropResult?.detectedBg.r ?? 255}, ${autoCropResult?.detectedBg.g ?? 255}, ${autoCropResult?.detectedBg.b ?? 255})`
                          }}
                        />
                        <span>RGB({autoCropResult?.detectedBg.r}, {autoCropResult?.detectedBg.g}, {autoCropResult?.detectedBg.b})</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400 font-medium">여백 감지 감도 (오차 허용치)</span>
                    <span className="text-indigo-400 font-mono font-bold text-sm">{tolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="60"
                    value={tolerance}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setTolerance(val);
                      handleRecalculateAutoCrop(val);
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <p className="text-xs text-slate-400">
                    * 그라디언트나 노이즈가 있는 여백은 감도를 높이면 더 깔끔하게 잘립니다.
                  </p>
                </div>

                {/* Trimmed pixel breakdown */}
                {autoCropResult && (
                  <div className="grid grid-cols-4 gap-1 pt-1 text-center font-mono text-xs">
                    <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block">상단</span>
                      <strong className="text-white">-{autoCropResult.trimmedPixels.top}px</strong>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block">하단</span>
                      <strong className="text-white">-{autoCropResult.trimmedPixels.bottom}px</strong>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block">좌측</span>
                      <strong className="text-white">-{autoCropResult.trimmedPixels.left}px</strong>
                    </div>
                    <div className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <span className="text-slate-400 block">우측</span>
                      <strong className="text-white">-{autoCropResult.trimmedPixels.right}px</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Manual Crop Adjustments */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 font-bold text-xs flex items-center justify-center border border-purple-500/30">
                  2
                </span>
                <h3 className="font-bold text-white text-sm">Manual Crop (수동 미세 조정)</h3>
              </div>

              {/* Aspect Ratio Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  크롭 비율 제한
                </label>
                <div className="grid grid-cols-5 gap-1 text-xs">
                  {[
                    { mode: 'free', label: '자유' },
                    { mode: '1:1', label: '1:1' },
                    { mode: '4:3', label: '4:3' },
                    { mode: '16:9', label: '16:9' },
                    { mode: 'original', label: '원본' }
                  ].map((item) => (
                    <button
                      key={item.mode}
                      onClick={() => setAspectMode(item.mode as AspectRatioMode)}
                      className={`py-1 rounded-lg font-semibold transition cursor-pointer border ${
                        aspectMode === item.mode
                          ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                          : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine tuning pixel inputs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <span className="text-slate-300 text-xs font-medium">시작 X (가로)</span>
                  <input
                    type="number"
                    min="0"
                    max={imgNaturalSize.width - 10}
                    value={cropRect.x}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setCropRect((prev) => ({
                        ...prev,
                        x: val,
                        width: Math.min(prev.width, imgNaturalSize.width - val)
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-slate-300 text-xs font-medium">시작 Y (세로)</span>
                  <input
                    type="number"
                    min="0"
                    max={imgNaturalSize.height - 10}
                    value={cropRect.y}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setCropRect((prev) => ({
                        ...prev,
                        y: val,
                        height: Math.min(prev.height, imgNaturalSize.height - val)
                      }));
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Export & Save Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/30 shadow-xl space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center border border-emerald-500/30">
                  3
                </span>
                <h3 className="font-bold text-white text-sm">크롭 결과 내보내기</h3>
              </div>

              {/* Format Select (PNG, JPEG, WebP) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 block">
                  저장 포맷
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={`py-1.5 text-center text-xs font-bold uppercase rounded-xl border transition cursor-pointer ${
                        exportFormat === fmt
                          ? 'border-indigo-400 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'border-slate-700 bg-slate-950/70 text-slate-400 hover:border-slate-600 hover:text-white'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>

                {exportFormat !== 'png' && (
                  <div className="pt-1.5 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>화질 품질</span>
                      <span className="font-mono text-white">{Math.round(exportQuality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.05"
                      value={exportQuality}
                      onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleDownload}
                  disabled={isProcessing}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>크롭 이미지 다운로드 ({cropRect.width}×{cropRect.height})</span>
                </button>

                <button
                  onClick={handleCopyClipboard}
                  disabled={isProcessing}
                  className={`w-full py-2 px-3 rounded-xl font-semibold text-xs border transition flex items-center justify-center gap-2 cursor-pointer ${
                    copyFeedback
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  {copyFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>클립보드에 복사 완료!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>클립보드로 이미지 복사 (PNG)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
