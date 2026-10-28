import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Scissors,
  Scaling,
  Maximize2,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Sliders,
  Sparkles,
  Grid,
  Type,
  Square,
  Download,
  Copy,
  Check,
  Undo2,
  Redo2,
  Trash2,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
  Maximize
} from 'lucide-react';
import {
  CropRect,
  detectAutoCropBounds,
  applyResize,
  applyCanvasSizeWithAnchor,
  applySharpen,
  applyRegionMosaic,
  applyRotationAndFlip,
  applyColorAdjustments,
  applyBorderAndRadius,
  applyTextWatermark,
  cloneCanvas
} from '../utils/imageStudio';
import { copyImageBlobToClipboard } from '../utils/imageCropper';

// Tool List
type ActiveTool =
  | 'crop'      // 자르기
  | 'resize'    // 이미지 크기
  | 'canvas'    // 캔버스 크기
  | 'rotate'    // 회전 / 반전
  | 'color'     // 색상 보정
  | 'sharpen'   // 선명도
  | 'mosaic'    // 타일링 / 블러
  | 'text'      // 텍스트
  | 'border';   // 외곽효과

const SYSTEM_FONTS = [
  {
    category: '고딕체 (Sans-serif)',
    fonts: [
      { name: '맑은 고딕 (기본)', value: '"Malgun Gothic", "맑은 고딕", sans-serif' },
      { name: 'Pretendard / 시스템', value: 'system-ui, -apple-system, sans-serif' },
      { name: 'Apple SD 산돌고딕 Neo', value: '"Apple SD Gothic Neo", "Apple SD 산돌고딕 Neo", sans-serif' },
      { name: '나눔고딕', value: '"Nanum Gothic", "나눔고딕", sans-serif' },
      { name: 'Arial (영문 기본)', value: 'Arial, sans-serif' },
      { name: 'Impact (볼드 밈 폰트)', value: 'Impact, "Arial Black", sans-serif' },
    ]
  },
  {
    category: '명조체 (Serif)',
    fonts: [
      { name: '바탕체 (Windows)', value: '"Batang", "바탕체", serif' },
      { name: '애플명조 (macOS/iOS)', value: '"Apple Myungjo", "애플명조", serif' },
      { name: '나눔명조', value: '"Nanum Myeongjo", "나눔명조", serif' },
      { name: 'Georgia / Times', value: 'Georgia, "Times New Roman", serif' },
    ]
  },
  {
    category: '필기 / 특수 (Display & Mono)',
    fonts: [
      { name: '궁서체 (전통 필기)', value: '"Gungsuh", "궁서체", cursive' },
      { name: '코딩 고정폭 (Monospace)', value: 'Consolas, Monaco, monospace' },
    ]
  }
];

export const ImageEditView: React.FC = () => {
  // Source Image & History
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalCanvas, setOriginalCanvas] = useState<HTMLCanvasElement | null>(null);
  const [currentCanvas, setCurrentCanvas] = useState<HTMLCanvasElement | null>(null);
  const [history, setHistory] = useState<HTMLCanvasElement[]>([]);
  const [redoStack, setRedoStack] = useState<HTMLCanvasElement[]>([]);

  // Active Tool
  const [activeTool, setActiveTool] = useState<ActiveTool>('crop');

  // Tool 1: 자르기 (Crop)
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [cropTolerance, setCropTolerance] = useState<number>(18);
  const [cropInteraction, setCropInteraction] = useState<
    'none' | 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  >('none');
  const cropDragStart = useRef<{
    clientX: number;
    clientY: number;
    initialRect: CropRect;
  } | null>(null);

  // Tool 2: 이미지 크기 (Resize)
  const [targetWidth, setTargetWidth] = useState<number>(0);
  const [targetHeight, setTargetHeight] = useState<number>(0);
  const [lockAspect, setLockAspect] = useState<boolean>(true);

  // Tool 3: 캔버스 크기 (Canvas Size)
  const [canvasTargetW, setCanvasTargetW] = useState<number>(0);
  const [canvasTargetH, setCanvasTargetH] = useState<number>(0);
  const [canvasAnchor, setCanvasAnchor] = useState<{ row: number; col: number }>({ row: 1, col: 1 });
  const [canvasBgColor, setCanvasBgColor] = useState<string>('transparent');

  // Tool 5: 색상 보정 (Color)
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);

  // Tool 6: 선명도 (Sharpen)
  const [sharpenAmount, setSharpenAmount] = useState<number>(0);

  // Tool 7: 타일링 / 블러 (Mosaic / Blur)
  const [mosaicType, setMosaicType] = useState<'mosaic' | 'blur'>('mosaic');
  const [mosaicSize, setMosaicSize] = useState<number>(14);
  const [mosaicSelection, setMosaicSelection] = useState<CropRect | null>(null);
  const [isSelectingMosaic, setIsSelectingMosaic] = useState<boolean>(false);
  const mosaicStartPos = useRef<{ x: number; y: number } | null>(null);

  // Tool 8: 텍스트 (Text)
  const [textString, setTextString] = useState<string>('텍스트 입력');
  const [textSize, setTextSize] = useState<number>(36);
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [textOpacity, setTextOpacity] = useState<number>(0.95);
  const [textFont, setTextFont] = useState<string>('"Malgun Gothic", "맑은 고딕", sans-serif');
  const [textPos, setTextPos] = useState<{ x: number; y: number }>({ x: 40, y: 80 });
  const [hasTextBg, setHasTextBg] = useState<boolean>(false);
  const [textBgColor, setTextBgColor] = useState<string>('#000000');
  const [textBorderRadius, setTextBorderRadius] = useState<number>(8);
  const [textBorderWidth, setTextBorderWidth] = useState<number>(0);
  const [textBorderColor, setTextBorderColor] = useState<string>('#ffffff');
  const [isDraggingText, setIsDraggingText] = useState<boolean>(false);
  const textDragStart = useRef<{ clientX: number; clientY: number; initialPos: { x: number; y: number } } | null>(null);

  // Tool 9: 외곽효과 (Border & Radius)
  const [borderRadius, setBorderRadius] = useState<number>(0);
  const [borderWidth, setBorderWidth] = useState<number>(0);
  const [borderColor, setBorderColor] = useState<string>('#6366f1');

  // Export & Save Modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveFileName, setSaveFileName] = useState<string>('edited_image');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = useState<number>(0.92);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Viewport DOM & Canvas
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Zoom & Pan State
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; initialOffset: { x: number; y: number } } | null>(null);

  // Rotation & Flip Animation State
  const [animTransform, setAnimTransform] = useState<{
    rotate: number;
    scaleX: number;
    scaleY: number;
    isTransitioning: boolean;
  }>({
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
    isTransitioning: false
  });

  // Push state to history
  const pushHistory = (canvas: HTMLCanvasElement) => {
    setHistory((prev) => [...prev.slice(-25), cloneCanvas(canvas)]);
    setRedoStack([]);
  };

  // 1. File Upload / Paste Loader
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
        const canvas = cloneCanvas(img);
        setImageFile(file);
        setSaveFileName(file.name.replace(/\.[^/.]+$/, '') + '_edited');
        setOriginalCanvas(cloneCanvas(canvas));
        setCurrentCanvas(canvas);
        setHistory([]);
        setRedoStack([]);

        setTargetWidth(img.naturalWidth);
        setTargetHeight(img.naturalHeight);
        setCanvasTargetW(img.naturalWidth);
        setCanvasTargetH(img.naturalHeight);
        setCropRect({ x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
        setTextPos({
          x: Math.round(img.naturalWidth * 0.1),
          y: Math.round(img.naturalHeight * 0.8)
        });

        // Reset all tool parameters
        setBrightness(0);
        setContrast(0);
        setSaturation(0);
        setSharpenAmount(0);
        setBorderRadius(0);
        setBorderWidth(0);
        setMosaicSelection(null);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  // Global Paste Handler (Ctrl+V)
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

  // Sync display canvas: Renders live preview based on active tool's pending gauge parameters
  useEffect(() => {
    if (!currentCanvas || !displayCanvasRef.current) return;
    const disp = displayCanvasRef.current;

    let preview = currentCanvas;

    if (activeTool === 'color' && (brightness !== 0 || contrast !== 0 || saturation !== 0)) {
      preview = applyColorAdjustments(currentCanvas, { brightness, contrast, saturation });
    } else if (activeTool === 'sharpen' && sharpenAmount > 0) {
      preview = applySharpen(currentCanvas, sharpenAmount);
    } else if (activeTool === 'border' && (borderRadius > 0 || borderWidth > 0)) {
      preview = applyBorderAndRadius(currentCanvas, { radius: borderRadius, borderWidth, borderColor });
    } else if (activeTool === 'mosaic' && mosaicSelection && mosaicSelection.width > 2 && mosaicSelection.height > 2) {
      preview = applyRegionMosaic(currentCanvas, { type: mosaicType, rect: mosaicSelection, size: mosaicSize });
    }

    disp.width = preview.width;
    disp.height = preview.height;
    const ctx = disp.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, disp.width, disp.height);
      ctx.drawImage(preview, 0, 0);

      // Live selection outline for mosaic tool
      if (activeTool === 'mosaic' && mosaicSelection) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(mosaicSelection.x, mosaicSelection.y, mosaicSelection.width, mosaicSelection.height);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.fillRect(mosaicSelection.x, mosaicSelection.y, mosaicSelection.width, mosaicSelection.height);
      }
    }
  }, [
    currentCanvas,
    activeTool,
    brightness,
    contrast,
    saturation,
    sharpenAmount,
    borderRadius,
    borderWidth,
    borderColor,
    mosaicSelection,
    mosaicType,
    mosaicSize,
    isSelectingMosaic
  ]);

  // Undo
  const handleUndo = () => {
    if (history.length === 0 || !currentCanvas) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [...prev, cloneCanvas(currentCanvas)]);
    setHistory((prev) => prev.slice(0, -1));
    const restored = cloneCanvas(previous);
    setCurrentCanvas(restored);
    setTargetWidth(restored.width);
    setTargetHeight(restored.height);
    setCanvasTargetW(restored.width);
    setCanvasTargetH(restored.height);
    setCropRect({ x: 0, y: 0, width: restored.width, height: restored.height });
    setMosaicSelection(null);
  };

  // Redo
  const handleRedo = () => {
    if (redoStack.length === 0 || !currentCanvas) return;
    const next = redoStack[redoStack.length - 1];
    setHistory((prev) => [...prev, cloneCanvas(currentCanvas)]);
    setRedoStack((prev) => prev.slice(0, -1));
    const restored = cloneCanvas(next);
    setCurrentCanvas(restored);
    setTargetWidth(restored.width);
    setTargetHeight(restored.height);
    setCanvasTargetW(restored.width);
    setCanvasTargetH(restored.height);
    setCropRect({ x: 0, y: 0, width: restored.width, height: restored.height });
    setMosaicSelection(null);
  };

  // Reset
  const handleResetToOriginal = () => {
    if (!originalCanvas || !currentCanvas) return;
    pushHistory(currentCanvas);
    const restored = cloneCanvas(originalCanvas);
    setCurrentCanvas(restored);
    setTargetWidth(restored.width);
    setTargetHeight(restored.height);
    setCanvasTargetW(restored.width);
    setCanvasTargetH(restored.height);
    setCropRect({ x: 0, y: 0, width: restored.width, height: restored.height });
    setMosaicSelection(null);
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setSharpenAmount(0);
    setBorderRadius(0);
    setBorderWidth(0);
  };

  // Delete Image
  const handleDeleteImage = () => {
    setImageFile(null);
    setCurrentCanvas(null);
    setOriginalCanvas(null);
    setHistory([]);
    setRedoStack([]);
    setMosaicSelection(null);
  };

  // -------------------------------------------------------------
  // Commit current tool's pending changes into currentCanvas
  // -------------------------------------------------------------
  const handleApplyCurrentTool = () => {
    if (!currentCanvas) return;

    if (activeTool === 'crop') {
      if (
        cropRect.width > 0 &&
        cropRect.height > 0 &&
        (cropRect.width !== currentCanvas.width ||
          cropRect.height !== currentCanvas.height ||
          cropRect.x !== 0 ||
          cropRect.y !== 0)
      ) {
        handleApplyCrop();
      }
    } else if (activeTool === 'resize') {
      if (targetWidth !== currentCanvas.width || targetHeight !== currentCanvas.height) {
        handleApplyResize();
      }
    } else if (activeTool === 'canvas') {
      if (canvasTargetW !== currentCanvas.width || canvasTargetH !== currentCanvas.height) {
        handleApplyCanvasAnchor();
      }
    } else if (activeTool === 'color') {
      if (brightness !== 0 || contrast !== 0 || saturation !== 0) {
        pushHistory(currentCanvas);
        const colored = applyColorAdjustments(currentCanvas, { brightness, contrast, saturation });
        setCurrentCanvas(colored);
        setBrightness(0);
        setContrast(0);
        setSaturation(0);
      }
    } else if (activeTool === 'sharpen') {
      if (sharpenAmount > 0) {
        pushHistory(currentCanvas);
        const sharpened = applySharpen(currentCanvas, sharpenAmount);
        setCurrentCanvas(sharpened);
        setSharpenAmount(0);
      }
    } else if (activeTool === 'mosaic') {
      if (mosaicSelection && mosaicSelection.width > 2 && mosaicSelection.height > 2) {
        pushHistory(currentCanvas);
        const processed = applyRegionMosaic(currentCanvas, {
          type: mosaicType,
          rect: mosaicSelection,
          size: mosaicSize
        });
        setCurrentCanvas(processed);
        setMosaicSelection(null);
      }
    } else if (activeTool === 'text') {
      if (textString.trim()) {
        handleBakeText();
      }
    } else if (activeTool === 'border') {
      if (borderRadius > 0 || borderWidth > 0) {
        pushHistory(currentCanvas);
        const bordered = applyBorderAndRadius(currentCanvas, {
          radius: borderRadius,
          borderWidth,
          borderColor
        });
        setCurrentCanvas(bordered);
        setBorderRadius(0);
        setBorderWidth(0);
      }
    }
  };

  // Tool Switching: Automatically commits current tool's pending changes!
  const handleSelectTool = (newTool: ActiveTool) => {
    if (newTool === activeTool) return;
    handleApplyCurrentTool();
    setActiveTool(newTool);
  };

  // -------------------------------------------------------------
  // Tool 1: 자르기 Handlers
  // -------------------------------------------------------------
  const handleApplyCrop = () => {
    if (!currentCanvas || cropRect.width <= 0 || cropRect.height <= 0) return;
    pushHistory(currentCanvas);
    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, cropRect.width);
    cropped.height = Math.max(1, cropRect.height);
    const ctx = cropped.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        currentCanvas,
        cropRect.x, cropRect.y, cropRect.width, cropRect.height,
        0, 0, cropped.width, cropped.height
      );
      setCurrentCanvas(cropped);
      setTargetWidth(cropped.width);
      setTargetHeight(cropped.height);
      setCanvasTargetW(cropped.width);
      setCanvasTargetH(cropped.height);
      setCropRect({ x: 0, y: 0, width: cropped.width, height: cropped.height });
    }
  };

  const handleAutoCropDirect = () => {
    if (!currentCanvas) return;
    const autoRes = detectAutoCropBounds(currentCanvas, { tolerance: cropTolerance });
    const rect = autoRes.rect;
    if (rect.width <= 0 || rect.height <= 0) {
      alert('제거할 여백이 감지되지 않았습니다.');
      return;
    }
    pushHistory(currentCanvas);
    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, rect.width);
    cropped.height = Math.max(1, rect.height);
    const ctx = cropped.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        currentCanvas,
        rect.x, rect.y, rect.width, rect.height,
        0, 0, cropped.width, cropped.height
      );
      setCurrentCanvas(cropped);
      setTargetWidth(cropped.width);
      setTargetHeight(cropped.height);
      setCanvasTargetW(cropped.width);
      setCanvasTargetH(cropped.height);
      setCropRect({ x: 0, y: 0, width: cropped.width, height: cropped.height });
    }
  };

  const handleCropHandlePointerDown = (
    e: React.PointerEvent,
    action: 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setCropInteraction(action);
    cropDragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialRect: { ...cropRect }
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleCropHandlePointerMove = (e: React.PointerEvent) => {
    if (cropInteraction === 'none' || !cropDragStart.current || !currentCanvas || !displayCanvasRef.current) return;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const scaleX = currentCanvas.width / Math.max(1, rect.width);
    const scaleY = currentCanvas.height / Math.max(1, rect.height);
    const dx = (e.clientX - cropDragStart.current.clientX) * scaleX;
    const dy = (e.clientY - cropDragStart.current.clientY) * scaleY;
    const init = cropDragStart.current.initialRect;

    let newX = init.x;
    let newY = init.y;
    let newW = init.width;
    let newH = init.height;

    if (cropInteraction === 'move') {
      newX = Math.max(0, Math.min(currentCanvas.width - newW, init.x + dx));
      newY = Math.max(0, Math.min(currentCanvas.height - newH, init.y + dy));
    } else {
      if (cropInteraction.includes('e')) {
        newW = Math.max(10, Math.min(currentCanvas.width - init.x, init.width + dx));
      }
      if (cropInteraction.includes('s')) {
        newH = Math.max(10, Math.min(currentCanvas.height - init.y, init.height + dy));
      }
      if (cropInteraction.includes('w')) {
        const maxW = init.x + init.width;
        const proposedW = init.width - dx;
        if (proposedW >= 10 && proposedW <= maxW) {
          newW = proposedW;
          newX = init.x + dx;
        }
      }
      if (cropInteraction.includes('n')) {
        const maxH = init.y + init.height;
        const proposedH = init.height - dy;
        if (proposedH >= 10 && proposedH <= maxH) {
          newH = proposedH;
          newY = init.y + dy;
        }
      }
    }

    setCropRect({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newW),
      height: Math.round(newH)
    });
  };

  const handleCropHandlePointerUp = (e: React.PointerEvent) => {
    if (cropInteraction !== 'none') {
      setCropInteraction('none');
      cropDragStart.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // -------------------------------------------------------------
  // Tool 2: 이미지 크기 Handlers
  // -------------------------------------------------------------
  const handleApplyResize = () => {
    if (!currentCanvas) return;
    pushHistory(currentCanvas);
    const resized = applyResize(currentCanvas, targetWidth, targetHeight);
    setCurrentCanvas(resized);
    setCanvasTargetW(resized.width);
    setCanvasTargetH(resized.height);
    setCropRect({ x: 0, y: 0, width: resized.width, height: resized.height });
  };

  // -------------------------------------------------------------
  // Tool 3: 캔버스 크기 Handlers
  // -------------------------------------------------------------
  const handleApplyCanvasAnchor = () => {
    if (!currentCanvas) return;
    pushHistory(currentCanvas);
    const newCanvas = applyCanvasSizeWithAnchor(
      currentCanvas,
      canvasTargetW,
      canvasTargetH,
      canvasAnchor.row,
      canvasAnchor.col,
      canvasBgColor
    );
    setCurrentCanvas(newCanvas);
    setTargetWidth(newCanvas.width);
    setTargetHeight(newCanvas.height);
    setCropRect({ x: 0, y: 0, width: newCanvas.width, height: newCanvas.height });
  };

  const getAnchorArrowSymbol = (r: number, c: number) => {
    if (r === canvasAnchor.row && c === canvasAnchor.col) return '●';
    const dr = r - canvasAnchor.row;
    const dc = c - canvasAnchor.col;
    const isShrink = currentCanvas
      ? (canvasTargetW < currentCanvas.width && dc !== 0) || (canvasTargetH < currentCanvas.height && dr !== 0)
      : false;

    const effDr = isShrink ? -dr : dr;
    const effDc = isShrink ? -dc : dc;

    if (effDr === -1 && effDc === -1) return '↖';
    if (effDr === -1 && effDc === 0) return '↑';
    if (effDr === -1 && effDc === 1) return '↗';
    if (effDr === 0 && effDc === -1) return '←';
    if (effDr === 0 && effDc === 1) return '→';
    if (effDr === 1 && effDc === -1) return '↙';
    if (effDr === 1 && effDc === 0) return '↓';
    if (effDr === 1 && effDc === 1) return '↘';
    return '•';
  };

  // -------------------------------------------------------------
  // Tool 4: 회전 / 반전 Handlers (우로 90°, 좌로 90°, 좌우 반전, 상하 반전)
  // -------------------------------------------------------------
  const handleApplyRotate = (angle: number) => {
    if (!currentCanvas) return;
    pushHistory(currentCanvas);
    const rotated = applyRotationAndFlip(currentCanvas, angle, false, false);
    setCurrentCanvas(rotated);
    setTargetWidth(rotated.width);
    setTargetHeight(rotated.height);
    setCanvasTargetW(rotated.width);
    setCanvasTargetH(rotated.height);
    setCropRect({ x: 0, y: 0, width: rotated.width, height: rotated.height });
  };

  const handleApplyFlip = (h: boolean, v: boolean) => {
    if (!currentCanvas) return;
    pushHistory(currentCanvas);
    const flipped = applyRotationAndFlip(currentCanvas, 0, h, v);
    setCurrentCanvas(flipped);
  };

  // Animated Rotation
  const handleApplyRotateWithAnim = (angle: number) => {
    if (!currentCanvas || animTransform.isTransitioning) return;
    setAnimTransform({
      rotate: angle === 270 ? -90 : angle,
      scaleX: 1,
      scaleY: 1,
      isTransitioning: true
    });
    setTimeout(() => {
      handleApplyRotate(angle);
      setAnimTransform({
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
        isTransitioning: false
      });
    }, 280);
  };

  // Animated Flip
  const handleApplyFlipWithAnim = (h: boolean, v: boolean) => {
    if (!currentCanvas || animTransform.isTransitioning) return;
    setAnimTransform({
      rotate: 0,
      scaleX: h ? -1 : 1,
      scaleY: v ? -1 : 1,
      isTransitioning: true
    });
    setTimeout(() => {
      handleApplyFlip(h, v);
      setAnimTransform({
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
        isTransitioning: false
      });
    }, 280);
  };

  // Zoom & Pan Handlers
  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((prev) => Math.max(0.25, Math.min(5.0, Number((prev + delta).toFixed(2)))));
  };

  const handleViewportBgPointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'mosaic') return;
    if (zoomLevel > 1 || e.button === 1 || e.altKey) {
      isPanningRef.current = true;
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        initialOffset: { ...panOffset }
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handleViewportBgPointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPanOffset({
        x: Math.round(panStartRef.current.initialOffset.x + dx),
        y: Math.round(panStartRef.current.initialOffset.y + dy)
      });
    }
  };

  const handleViewportBgPointerUp = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      panStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // -------------------------------------------------------------
  // Tool 7: 타일링 / 블러 Drag Handlers
  // -------------------------------------------------------------
  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!currentCanvas || !displayCanvasRef.current) return;

    if (activeTool === 'mosaic') {
      const rect = displayCanvasRef.current.getBoundingClientRect();
      const scaleX = currentCanvas.width / Math.max(1, rect.width);
      const scaleY = currentCanvas.height / Math.max(1, rect.height);
      const imgX = (e.clientX - rect.left) * scaleX;
      const imgY = (e.clientY - rect.top) * scaleY;

      setIsSelectingMosaic(true);
      mosaicStartPos.current = { x: imgX, y: imgY };
      setMosaicSelection({ x: imgX, y: imgY, width: 0, height: 0 });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'mosaic' && isSelectingMosaic && mosaicStartPos.current && currentCanvas && displayCanvasRef.current) {
      const rect = displayCanvasRef.current.getBoundingClientRect();
      const scaleX = currentCanvas.width / Math.max(1, rect.width);
      const scaleY = currentCanvas.height / Math.max(1, rect.height);
      const currX = (e.clientX - rect.left) * scaleX;
      const currY = (e.clientY - rect.top) * scaleY;

      const x = Math.min(mosaicStartPos.current.x, currX);
      const y = Math.min(mosaicStartPos.current.y, currY);
      const width = Math.abs(currX - mosaicStartPos.current.x);
      const height = Math.abs(currY - mosaicStartPos.current.y);

      setMosaicSelection({
        x: Math.round(Math.max(0, x)),
        y: Math.round(Math.max(0, y)),
        width: Math.round(Math.min(currentCanvas.width - x, width)),
        height: Math.round(Math.min(currentCanvas.height - y, height))
      });
    }
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'mosaic' && isSelectingMosaic) {
      setIsSelectingMosaic(false);
      mosaicStartPos.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // -------------------------------------------------------------
  // Tool 8: 텍스트 Drag Handlers & Bake
  // -------------------------------------------------------------
  const handleTextOverlayPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingText(true);
    textDragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialPos: { ...textPos }
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleTextOverlayPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingText || !textDragStart.current || !currentCanvas || !displayCanvasRef.current) return;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const scaleX = currentCanvas.width / Math.max(1, rect.width);
    const scaleY = currentCanvas.height / Math.max(1, rect.height);
    const dx = (e.clientX - textDragStart.current.clientX) * scaleX;
    const dy = (e.clientY - textDragStart.current.clientY) * scaleY;

    setTextPos({
      x: Math.round(Math.max(10, Math.min(currentCanvas.width - 20, textDragStart.current.initialPos.x + dx))),
      y: Math.round(Math.max(20, Math.min(currentCanvas.height - 10, textDragStart.current.initialPos.y + dy)))
    });
  };

  const handleTextOverlayPointerUp = (e: React.PointerEvent) => {
    if (isDraggingText) {
      setIsDraggingText(false);
      textDragStart.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  const handleBakeText = () => {
    if (!currentCanvas || !textString.trim()) return;
    pushHistory(currentCanvas);
    const watermarked = applyTextWatermark(currentCanvas, {
      text: textString,
      fontSize: textSize,
      fontFamily: textFont,
      color: textColor,
      opacity: textOpacity,
      position: 'custom',
      customX: textPos.x,
      customY: textPos.y,
      hasBackground: hasTextBg,
      backgroundColor: textBgColor,
      backgroundRadius: textBorderRadius,
      borderWidth: textBorderWidth,
      borderColor: textBorderColor
    });
    setCurrentCanvas(watermarked);
  };

  // -------------------------------------------------------------
  // Save & Download Trigger
  // -------------------------------------------------------------
  const handleExecuteSave = async () => {
    if (!currentCanvas) return;
    try {
      setIsProcessing(true);
      const mime = exportFormat === 'jpeg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png';
      const dataUrl = currentCanvas.toDataURL(mime, exportQuality);
      const a = document.createElement('a');
      const cleanName = saveFileName.trim() || 'edited_image';
      a.download = `${cleanName}.${exportFormat}`;
      a.href = dataUrl;
      a.click();
      setIsSaveModalOpen(false);
    } catch {
      alert('이미지 저장 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyClipboard = async () => {
    if (!currentCanvas) return;
    try {
      setIsProcessing(true);
      const success = await copyImageBlobToClipboard(currentCanvas, {
        x: 0,
        y: 0,
        width: currentCanvas.width,
        height: currentCanvas.height
      });
      if (success) {
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } else {
        alert('이 브라우저에서는 클립보드 직접 복사를 지원하지 않습니다. 이미지 저장 버튼을 이용해주세요.');
      }
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Viewport Coordinates Percentages
  const cropLeftPct = currentCanvas && currentCanvas.width > 0 ? (cropRect.x / currentCanvas.width) * 100 : 0;
  const cropTopPct = currentCanvas && currentCanvas.height > 0 ? (cropRect.y / currentCanvas.height) * 100 : 0;
  const cropWidthPct = currentCanvas && currentCanvas.width > 0 ? (cropRect.width / currentCanvas.width) * 100 : 100;
  const cropHeightPct = currentCanvas && currentCanvas.height > 0 ? (cropRect.height / currentCanvas.height) * 100 : 100;

  const textLeftPct = currentCanvas && currentCanvas.width > 0 ? (textPos.x / currentCanvas.width) * 100 : 10;
  const textTopPct = currentCanvas && currentCanvas.height > 0 ? (textPos.y / currentCanvas.height) * 100 : 80;

  const PALETTE_TOOLS = [
    { id: 'crop', label: '자르기', icon: Scissors },
    { id: 'resize', label: '이미지 크기', icon: Scaling },
    { id: 'canvas', label: '캔버스 크기', icon: Maximize2 },
    { id: 'rotate', label: '회전 / 반전', icon: RotateCw },
    { id: 'color', label: '색상 보정', icon: Sliders },
    { id: 'sharpen', label: '선명도', icon: Sparkles },
    { id: 'mosaic', label: '타일링 / 블러', icon: Grid },
    { id: 'text', label: '텍스트', icon: Type },
    { id: 'border', label: '외곽효과', icon: Square },
  ] as const;

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

      {/* Top Bar: Title + Actions (Undo, Redo, Reset, Delete, Copy, Save) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-sm">
        <div className="flex items-center gap-2.5 lg:w-44 shrink-0">
          <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Scissors className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-white">Image Edit</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              Studio
            </span>
          </div>
        </div>

        {currentCanvas && (
          <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center shrink-0">
            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                history.length > 0
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800/80 cursor-not-allowed opacity-50'
              }`}
              title="실행 취소"
            >
              <Undo2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">실행 취소</span>
              {history.length > 0 && <span className="text-[10px] text-slate-400 font-mono">({history.length})</span>}
            </button>

            {/* Redo */}
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                redoStack.length > 0
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800/80 cursor-not-allowed opacity-50'
              }`}
              title="다시 실행"
            >
              <Redo2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden md:inline">다시 실행</span>
              {redoStack.length > 0 && <span className="text-[10px] text-slate-400 font-mono">({redoStack.length})</span>}
            </button>

            {/* Reset */}
            <button
              onClick={handleResetToOriginal}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              title="최초 원본 복원"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">초기화</span>
            </button>

            {/* Delete Image */}
            <button
              onClick={handleDeleteImage}
              className="px-2.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-xs font-semibold text-red-300 border border-red-500/30 transition flex items-center gap-1.5 cursor-pointer"
              title="이미지 삭제"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">이미지 삭제</span>
            </button>

            <div className="h-4 w-px bg-slate-700 mx-0.5" />

            {/* Copy */}
            <button
              onClick={handleCopyClipboard}
              disabled={isProcessing}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                copyFeedback
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {copyFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>복사 완료!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>클립보드 복사</span>
                </>
              )}
            </button>

            {/* Save */}
            <button
              onClick={() => setIsSaveModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-md shadow-indigo-600/25 border border-indigo-400/40 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>이미지 저장</span>
            </button>
          </div>
        )}
      </div>

      {/* Zero State: Drag & Drop Upload Zone */}
      {!currentCanvas ? (
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
          className={`border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center cursor-pointer transition-all duration-300 group ${
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
                편집할 이미지를 끌어다 놓으세요
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                클릭하여 파일 찾기 또는 <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-indigo-300">Ctrl+V</kbd> 로 붙여넣기
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Workspace Layout: Left Palette (w-44) + Center Viewport (flex-1) + Right Options (w-64) */
        <div className="flex flex-col lg:flex-row gap-3 items-start w-full">
          {/* ========================================================================= */}
          {/* 1. LEFT: Slim Tool Palette (w-44)                                         */}
          {/* ========================================================================= */}
          <div className="w-full lg:w-44 shrink-0 p-2 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-2.5 max-h-[calc(100vh-130px)] overflow-y-auto">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-0.5 border-b border-slate-800/80 flex items-center justify-between">
              <span>도구 팔레트</span>
              <span className="text-[9px] text-indigo-400 font-mono">9 Tools</span>
            </div>

            <div className="grid grid-cols-3 lg:grid-cols-1 gap-1">
              {PALETTE_TOOLS.map((tool) => {
                const IconComponent = tool.icon;
                const isSelected = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    onClick={() => handleSelectTool(tool.id as ActiveTool)}
                    className={`flex items-center gap-2 w-full p-2 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/25 border border-indigo-400/50'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <IconComponent className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold leading-tight truncate">{tool.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] font-mono space-y-0.5">
                <div className="text-[10px] text-slate-400">캔버스 해상도</div>
                <div className="font-bold text-white tracking-tight">
                  {currentCanvas.width} × {currentCanvas.height} px
                </div>
              </div>

              <div className="text-[10px] text-center text-slate-400 px-2 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800/60 leading-tight">
                <kbd className="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[9px] border border-slate-700">Ctrl+V</kbd> 새 이미지 교체
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2. CENTER: Maximized Interactive Canvas Viewport (flex-1)                 */}
          {/* ========================================================================= */}
          <div className="flex-1 min-w-0 w-full space-y-2">
            <div
              ref={viewportContainerRef}
              onPointerDown={(e) => {
                handleViewportPointerDown(e);
                handleViewportBgPointerDown(e);
              }}
              onPointerMove={(e) => {
                handleViewportPointerMove(e);
                handleViewportBgPointerMove(e);
              }}
              onPointerUp={(e) => {
                handleViewportPointerUp(e);
                handleViewportBgPointerUp(e);
              }}
              onWheel={handleWheelZoom}
              className={`relative rounded-2xl bg-slate-950/85 border border-slate-800 shadow-2xl overflow-hidden p-2 sm:p-4 flex items-center justify-center min-h-[460px] max-h-[calc(100vh-130px)] select-none ${
                activeTool === 'mosaic' ? 'cursor-crosshair' : zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              {/* Checkerboard transparency grid */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: `linear-gradient(45deg, #475569 25%, transparent 25%), linear-gradient(-45deg, #475569 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #475569 75%), linear-gradient(-45deg, transparent 75%, #475569 75%)`,
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                }}
              />

              {/* Main Canvas Container with Smooth Animated Transform and Zoom/Pan */}
              <div
                className="relative inline-block max-w-full max-h-[calc(100vh-150px)] will-change-transform"
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel}) rotate(${animTransform.rotate}deg) scale(${animTransform.scaleX}, ${animTransform.scaleY})`,
                  transition: animTransform.isTransitioning
                    ? 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                    : 'transform 75ms ease-out',
                  transformOrigin: 'center center'
                }}
              >
                <canvas
                  ref={displayCanvasRef}
                  className="block max-w-full max-h-[calc(100vh-150px)] object-contain rounded shadow"
                />

                {/* Crop Overlay & 8 Handles */}
                {activeTool === 'crop' && (
                  <>
                    <div className="absolute left-0 right-0 top-0 bg-slate-950/75 pointer-events-none" style={{ height: `${cropTopPct}%` }} />
                    <div className="absolute left-0 right-0 bottom-0 bg-slate-950/75 pointer-events-none" style={{ height: `${Math.max(0, 100 - (cropTopPct + cropHeightPct))}%` }} />
                    <div className="absolute left-0 bg-slate-950/75 pointer-events-none" style={{ top: `${cropTopPct}%`, height: `${cropHeightPct}%`, width: `${cropLeftPct}%` }} />
                    <div className="absolute right-0 bg-slate-950/75 pointer-events-none" style={{ top: `${cropTopPct}%`, height: `${cropHeightPct}%`, width: `${Math.max(0, 100 - (cropLeftPct + cropWidthPct))}%` }} />

                    <div
                      onPointerDown={(e) => handleCropHandlePointerDown(e, 'move')}
                      onPointerMove={handleCropHandlePointerMove}
                      onPointerUp={handleCropHandlePointerUp}
                      className="absolute border-2 border-indigo-400 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_0_14px_rgba(99,102,241,0.35)] cursor-move group"
                      style={{
                        left: `${cropLeftPct}%`,
                        top: `${cropTopPct}%`,
                        width: `${cropWidthPct}%`,
                        height: `${cropHeightPct}%`
                      }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-950/95 text-[10px] font-mono text-indigo-300 border border-indigo-500/40 whitespace-nowrap shadow pointer-events-none">
                        {cropRect.width} × {cropRect.height} px
                      </div>

                      {/* 8 Handles */}
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'nw')} className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'n')} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-ns-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'ne')} className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'e')} className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-ew-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'se')} className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 's')} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-ns-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize hover:scale-125 transition-transform" />
                      <div onPointerDown={(e) => handleCropHandlePointerDown(e, 'w')} className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm cursor-ew-resize hover:scale-125 transition-transform" />
                    </div>
                  </>
                )}

                {/* Clean Draggable Text Box without banners */}
                {activeTool === 'text' && (
                  <div
                    onPointerDown={handleTextOverlayPointerDown}
                    onPointerMove={handleTextOverlayPointerMove}
                    onPointerUp={handleTextOverlayPointerUp}
                    className="absolute z-20 cursor-move border border-dashed border-indigo-400 select-none shadow-2xl"
                    style={{
                      left: `${textLeftPct}%`,
                      top: `${textTopPct}%`,
                      transform: 'translate(-10px, -24px)',
                      backgroundColor: hasTextBg ? textBgColor : 'rgba(15, 23, 42, 0.4)',
                      borderRadius: hasTextBg ? `${textBorderRadius}px` : '4px',
                      borderWidth: hasTextBg && textBorderWidth > 0 ? `${textBorderWidth}px` : undefined,
                      borderColor: hasTextBg && textBorderWidth > 0 ? textBorderColor : undefined,
                      padding: '6px 12px'
                    }}
                  >
                    <div
                      style={{
                        fontFamily: textFont,
                        fontSize: `${Math.max(12, Math.round(textSize * 0.7))}px`,
                        color: textColor,
                        opacity: textOpacity,
                        fontWeight: 'bold',
                        lineHeight: 1.2
                      }}
                      className="whitespace-nowrap"
                    >
                      {textString || '(텍스트)'}
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Zoom Control Bar (Bottom-Right) */}
              <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md text-xs select-none">
                <button
                  onClick={() => setZoomLevel((prev) => Math.max(0.25, Number((prev - 0.25).toFixed(2))))}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                  title="축소 (Zoom Out)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    setZoomLevel(1.0);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="px-2 py-0.5 rounded-lg font-mono font-bold text-[11px] text-indigo-300 hover:bg-slate-800 transition cursor-pointer"
                  title="100% 원본 크기"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>

                <button
                  onClick={() => setZoomLevel((prev) => Math.min(5.0, Number((prev + 0.25).toFixed(2))))}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                  title="확대 (Zoom In)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <div className="h-3 w-px bg-slate-700 mx-0.5" />

                <button
                  onClick={() => {
                    setZoomLevel(1.0);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition cursor-pointer flex items-center gap-1"
                  title="화면 맞춤 (Fit to Viewport)"
                >
                  <Maximize className="w-3 h-3 text-indigo-400" />
                  <span>화면 맞춤</span>
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. RIGHT: Active Tool Settings                                            */}
          {/* ========================================================================= */}
          <div className="w-full lg:w-64 shrink-0 space-y-3">
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3.5 max-h-[calc(100vh-130px)] overflow-y-auto pb-8">
              {/* Header: Tool Label + '변경 적용' Button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300">
                  {PALETTE_TOOLS.find((t) => t.id === activeTool)?.label}
                </span>
                <button
                  onClick={handleApplyCurrentTool}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>변경 적용</span>
                </button>
              </div>

              {/* ---------------- Tool 1: 자르기 ---------------- */}
              {activeTool === 'crop' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Auto Crop 여백 감도</span>
                      <span className="font-mono text-indigo-300 font-bold">{cropTolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="60"
                      value={cropTolerance}
                      onChange={(e) => setCropTolerance(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={handleAutoCropDirect}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold border border-indigo-400/40 transition text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/25"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                      <span>Auto Crop</span>
                    </button>

                    <button
                      onClick={() => setCropRect({ x: 0, y: 0, width: currentCanvas.width, height: currentCanvas.height })}
                      className="w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition cursor-pointer"
                    >
                      자르기 리셋
                    </button>
                  </div>

                  <button
                    onClick={handleApplyCrop}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/40 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>자르기 적용</span>
                  </button>
                </div>
              )}

              {/* ---------------- Tool 2: 이미지 크기 ---------------- */}
              {activeTool === 'resize' && (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px]">가로 너비 (W px)</span>
                      <input
                        type="number"
                        min="10"
                        max="8000"
                        value={targetWidth}
                        onChange={(e) => {
                          const w = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setTargetWidth(w);
                          if (lockAspect && currentCanvas) {
                            setTargetHeight(Math.round(w / (currentCanvas.width / currentCanvas.height)));
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px]">세로 높이 (H px)</span>
                      <input
                        type="number"
                        min="10"
                        max="8000"
                        value={targetHeight}
                        onChange={(e) => {
                          const h = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setTargetHeight(h);
                          if (lockAspect && currentCanvas) {
                            setTargetWidth(Math.round(h * (currentCanvas.width / currentCanvas.height)));
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={lockAspect}
                      onChange={(e) => setLockAspect(e.target.checked)}
                      className="accent-indigo-500 rounded"
                    />
                    <span>종횡 비율 고정 (Keep Aspect Ratio)</span>
                  </label>

                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[
                      { label: '25%', factor: 0.25 },
                      { label: '50%', factor: 0.5 },
                      { label: '75%', factor: 0.75 },
                      { label: '200%', factor: 2.0 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          if (!currentCanvas) return;
                          setTargetWidth(Math.round(currentCanvas.width * p.factor));
                          setTargetHeight(Math.round(currentCanvas.height * p.factor));
                        }}
                        className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ---------------- Tool 3: 캔버스 크기 ---------------- */}
              {activeTool === 'canvas' && (
                <div className="space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px]">목표 가로 너비 (W px)</span>
                      <input
                        type="number"
                        min="1"
                        max="8000"
                        value={canvasTargetW}
                        onChange={(e) => setCanvasTargetW(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px]">목표 세로 높이 (H px)</span>
                      <input
                        type="number"
                        min="1"
                        max="8000"
                        value={canvasTargetH}
                        onChange={(e) => setCanvasTargetH(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] text-slate-400">
                      <span>고정 앵커 위치</span>
                      <span className="text-[10px] text-indigo-400 font-mono">
                        {canvasAnchor.row === 0 ? '상단' : canvasAnchor.row === 1 ? '중앙' : '하단'}{' '}
                        {canvasAnchor.col === 0 ? '좌측' : canvasAnchor.col === 1 ? '가운데' : '우측'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-950/80 rounded-xl border border-slate-800 max-w-[190px] mx-auto">
                      {[0, 1, 2].map((r) =>
                        [0, 1, 2].map((c) => {
                          const isAnchor = canvasAnchor.row === r && canvasAnchor.col === c;
                          const arrow = getAnchorArrowSymbol(r, c);
                          return (
                            <button
                              key={`${r}-${c}`}
                              onClick={() => setCanvasAnchor({ row: r, col: c })}
                              className={`h-11 rounded-lg flex flex-col items-center justify-center transition cursor-pointer ${
                                isAnchor
                                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-extrabold shadow-md shadow-indigo-600/40 border border-indigo-400 scale-105'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                              }`}
                            >
                              <span className="text-sm font-mono leading-none">{arrow}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-slate-400 text-[11px]">확장 여백 배경색</span>
                    <div className="flex gap-2 items-center">
                      {[
                        { id: 'transparent', label: '투명' },
                        { id: '#ffffff', label: '흰색' },
                        { id: '#000000', label: '검정' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setCanvasBgColor(c.id)}
                          className={`py-1 px-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                            canvasBgColor === c.id
                              ? 'border-indigo-400 bg-indigo-600/30 text-white'
                              : 'border-slate-700 bg-slate-950 text-slate-400'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                      <input
                        type="color"
                        value={canvasBgColor === 'transparent' ? '#ffffff' : canvasBgColor}
                        onChange={(e) => setCanvasBgColor(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ---------------- Tool 4: 회전 / 반전 (우로 90°, 좌로 90°, 좌우 반전, 상하 반전) ---------------- */}
              {activeTool === 'rotate' && (
                <div className="space-y-2 text-xs">
                  <button
                    onClick={() => handleApplyRotateWithAnim(90)}
                    disabled={animTransform.isTransitioning}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-3 cursor-pointer transition disabled:opacity-50"
                  >
                    <RotateCw className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>우로 90° 회전</span>
                  </button>

                  <button
                    onClick={() => handleApplyRotateWithAnim(270)}
                    disabled={animTransform.isTransitioning}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-3 cursor-pointer transition disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>좌로 90° 회전</span>
                  </button>

                  <button
                    onClick={() => handleApplyFlipWithAnim(true, false)}
                    disabled={animTransform.isTransitioning}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-3 cursor-pointer transition disabled:opacity-50"
                  >
                    <FlipHorizontal className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>좌우 반전</span>
                  </button>

                  <button
                    onClick={() => handleApplyFlipWithAnim(false, true)}
                    disabled={animTransform.isTransitioning}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-3 cursor-pointer transition disabled:opacity-50"
                  >
                    <FlipVertical className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>상하 반전</span>
                  </button>
                </div>
              )}

              {/* ---------------- Tool 5: 색상 보정 ---------------- */}
              {activeTool === 'color' && (
                <div className="space-y-3 text-xs">
                  {/* 밝기 */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">밝기 (Brightness)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={brightness}
                        onChange={(e) => setBrightness(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="-100"
                          max="100"
                          value={brightness}
                          onChange={(e) => setBrightness(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 대비 */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">대비 (Contrast)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={contrast}
                        onChange={(e) => setContrast(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="-100"
                          max="100"
                          value={contrast}
                          onChange={(e) => setContrast(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 채도 */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">채도 (Saturation)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={saturation}
                        onChange={(e) => setSaturation(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="-100"
                          max="100"
                          value={saturation}
                          onChange={(e) => setSaturation(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setBrightness(0);
                      setContrast(0);
                      setSaturation(0);
                    }}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>색상 초기화</span>
                  </button>
                </div>
              )}

              {/* ---------------- Tool 6: 선명도 (게이지 미리보기 + 수치 입력) ---------------- */}
              {activeTool === 'sharpen' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">선명도 강도 (%)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sharpenAmount}
                        onChange={(e) => setSharpenAmount(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={sharpenAmount}
                          onChange={(e) => setSharpenAmount(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">%</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSharpenAmount(0)}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>선명도 초기화</span>
                  </button>
                </div>
              )}

              {/* ---------------- Tool 7: 타일링 / 블러 (게이지 미리보기 + 수치 입력) ---------------- */}
              {activeTool === 'mosaic' && (
                <div className="space-y-3 text-xs">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMosaicType('mosaic')}
                      className={`flex-1 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                        mosaicType === 'mosaic'
                          ? 'border-sky-400 bg-sky-600/30 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      모자이크 (타일링)
                    </button>
                    <button
                      onClick={() => setMosaicType('blur')}
                      className={`flex-1 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                        mosaicType === 'blur'
                          ? 'border-sky-400 bg-sky-600/30 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      가우시안 블러 (흐림)
                    </button>
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">
                      {mosaicType === 'mosaic' ? '타일 크기 (px)' : '블러 반경 (px)'}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="4"
                        max="50"
                        value={mosaicSize}
                        onChange={(e) => setMosaicSize(parseInt(e.target.value, 10) || 4)}
                        className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="4"
                          max="100"
                          value={mosaicSize}
                          onChange={(e) => setMosaicSize(Math.max(2, parseInt(e.target.value, 10) || 4))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">px</span>
                      </div>
                    </div>
                  </div>

                  {mosaicSelection && (
                    <div className="text-[11px] text-slate-300 font-mono bg-slate-950 p-2 rounded-lg border border-slate-800 flex justify-between items-center">
                      <span>선택 영역</span>
                      <span className="text-sky-400">{mosaicSelection.width} × {mosaicSelection.height} px</span>
                    </div>
                  )}

                  {mosaicSelection && (
                    <button
                      onClick={() => setMosaicSelection(null)}
                      className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition cursor-pointer"
                    >
                      영역 선택 해제
                    </button>
                  )}
                </div>
              )}

              {/* ---------------- Tool 8: 텍스트 (텍스트 색상, 배경 색상, 모서리, 테두리 수치 입력) ---------------- */}
              {activeTool === 'text' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">입력할 텍스트</span>
                    <input
                      type="text"
                      value={textString}
                      onChange={(e) => setTextString(e.target.value)}
                      placeholder="텍스트 입력"
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">기본 시스템 폰트</span>
                    <select
                      value={textFont}
                      onChange={(e) => setTextFont(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                    >
                      {SYSTEM_FONTS.map((group) => (
                        <optgroup key={group.category} label={group.category} className="bg-slate-900 text-slate-200 font-semibold">
                          {group.fonts.map((f) => (
                            <option key={f.name} value={f.value} className="bg-slate-950 text-white font-normal">
                              {f.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* 폰트 크기: Slider (좌) + Number (우, px) */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">폰트 크기 (px)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="12"
                        max="160"
                        value={textSize}
                        onChange={(e) => setTextSize(parseInt(e.target.value, 10) || 12)}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="10"
                          max="300"
                          value={textSize}
                          onChange={(e) => setTextSize(Math.max(8, parseInt(e.target.value, 10) || 12))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">px</span>
                      </div>
                    </div>
                  </div>

                  {/* 투명도: Slider (좌) + Number (우, %) */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">투명도 (%)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="5"
                        max="100"
                        value={Math.round(textOpacity * 100)}
                        onChange={(e) => setTextOpacity((parseInt(e.target.value, 10) || 5) / 100)}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="5"
                          max="100"
                          value={Math.round(textOpacity * 100)}
                          onChange={(e) => setTextOpacity(Math.min(100, Math.max(5, parseInt(e.target.value, 10) || 5)) / 100)}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">%</span>
                      </div>
                    </div>
                  </div>

                  {/* 텍스트 색상 */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400">텍스트 색상</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs text-center focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* 배경 색상 */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">배경 색상</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={hasTextBg}
                          onChange={(e) => setHasTextBg(e.target.checked)}
                          className="accent-indigo-500 rounded"
                        />
                        <span>사용</span>
                      </label>
                      {hasTextBg && (
                        <>
                          <input
                            type="color"
                            value={textBgColor}
                            onChange={(e) => setTextBgColor(e.target.value)}
                            className="w-7 h-7 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={textBgColor}
                            onChange={(e) => setTextBgColor(e.target.value)}
                            className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs text-center focus:outline-none"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* 모서리: Slider (좌) + Number (우, px) */}
                  {hasTextBg && (
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px]">모서리 (px)</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="60"
                          value={textBorderRadius}
                          onChange={(e) => setTextBorderRadius(parseInt(e.target.value, 10) || 0)}
                          className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={textBorderRadius}
                            onChange={(e) => setTextBorderRadius(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">px</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 테두리: Slider (좌) + Number (우, px) */}
                  {hasTextBg && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">테두리 (px)</span>
                        {textBorderWidth > 0 && (
                          <input
                            type="color"
                            value={textBorderColor}
                            onChange={(e) => setTextBorderColor(e.target.value)}
                            className="w-5 h-5 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="20"
                          value={textBorderWidth}
                          onChange={(e) => setTextBorderWidth(parseInt(e.target.value, 10) || 0)}
                          className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            min="0"
                            max="40"
                            value={textBorderWidth}
                            onChange={(e) => setTextBorderWidth(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">px</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ---------------- Tool 9: 외곽효과 (모서리/테두리 게이지 + 수치 입력) ---------------- */}
              {activeTool === 'border' && (
                <div className="space-y-3 text-xs">
                  {/* 모서리 둥글게 */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">모서리 둥글게 (px)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="150"
                        value={borderRadius}
                        onChange={(e) => setBorderRadius(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          max="300"
                          value={borderRadius}
                          onChange={(e) => setBorderRadius(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">px</span>
                      </div>
                    </div>
                  </div>

                  {/* 외곽 테두리 두께 */}
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px]">외곽 테두리 두께 (px)</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={borderWidth}
                        onChange={(e) => setBorderWidth(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex items-center gap-1 w-20 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={borderWidth}
                          onChange={(e) => setBorderWidth(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">px</span>
                      </div>
                    </div>
                  </div>

                  {borderWidth > 0 && (
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-slate-400">테두리 색상</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="w-7 h-7 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={borderColor}
                          onChange={(e) => setBorderColor(e.target.value)}
                          className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs text-center focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setBorderRadius(0);
                      setBorderWidth(0);
                    }}
                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>외곽효과 초기화</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: 이미지 저장                                                     */}
      {/* ========================================================================= */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-6 space-y-5 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">이미지 저장</h3>
                  <p className="text-xs text-slate-400">파일 형식 및 저장 파일명을 지정하세요</p>
                </div>
              </div>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              {/* File Name Input */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold text-xs">
                  저장 파일명
                </label>
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 focus-within:border-indigo-500">
                  <input
                    type="text"
                    value={saveFileName}
                    onChange={(e) => setSaveFileName(e.target.value)}
                    placeholder="저장할 파일명"
                    className="flex-1 bg-transparent text-white font-mono text-xs focus:outline-none"
                  />
                  <span className="text-slate-400 font-mono text-xs font-semibold">.{exportFormat}</span>
                </div>
              </div>

              {/* Format Selection (PNG / JPEG / WebP) */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold text-xs">
                  파일 형식 (Format)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'png', title: 'PNG', note: '무손실 / 투명도' },
                    { id: 'jpeg', title: 'JPEG', note: '사진용 / 압축' },
                    { id: 'webp', title: 'WebP', note: '차세대 / 고압축' },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      onClick={() => setExportFormat(fmt.id as 'png' | 'jpeg' | 'webp')}
                      className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        exportFormat === fmt.id
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                          : 'bg-slate-950 hover:bg-slate-800/80 text-slate-400 border-slate-800'
                      }`}
                    >
                      <span className="font-bold text-xs uppercase">{fmt.title}</span>
                      <span className="text-[10px] opacity-75">{fmt.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Slider (for lossy formats) */}
              {exportFormat !== 'png' && (
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>압축 품질 (Quality)</span>
                    <span className="font-mono text-indigo-400 font-bold">{Math.round(exportQuality * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.05"
                    value={exportQuality}
                    onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>50% (최대 압축)</span>
                    <span>92% (권장 품질)</span>
                    <span>100% (최고 화질)</span>
                  </div>
                </div>
              )}

              {/* Image Info Summary */}
              {currentCanvas && (
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 flex justify-between items-center text-slate-400 text-[11px]">
                  <span>출력 해상도:</span>
                  <span className="font-mono text-white font-bold">
                    {currentCanvas.width} × {currentCanvas.height} px
                  </span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleExecuteSave}
                disabled={isProcessing}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>저장 (다운로드)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
