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
  Maximize,
  ChevronLeft,
  ChevronRight,
  Activity,
  Eraser,
  Pipette,
  Plus,
  Scan,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight
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
  cloneCanvas,
  generateToneCurveLUT,
  applyToneCurves,
  applyTextStrokeThicken,
  applyBackgroundColorAdjustment,
  Point2D,
  QuadPoints,
  applyPerspectiveCrop,
  applyPerspectiveDistort,
  applySkew
} from '../utils/imageStudio';
import { copyImageBlobToClipboard } from '../utils/imageCropper';

// Tool List
type ActiveTool =
  | 'crop'      // 자르기
  | 'transform' // 자유 변형 (원근 자르기 / 왜곡 / 원근감 / 기울이기)
  | 'resize'    // 이미지 크기
  | 'canvas'    // 캔버스 크기
  | 'rotate'    // 회전 / 반전
  | 'bgcolor'   // 배경색 조정 (흰색 배경 투명화 등)
  | 'color'     // 색상 보정
  | 'curves'    // 톤 커브
  | 'sharpen'   // 선명도
  | 'mosaic'    // 타일링 / 블러
  | 'text'      // 텍스트
  | 'border';   // 외곽효과

const SYSTEM_FONTS = [
  {
    category: '고딕계열',
    fonts: [
      { name: 'Noto Sans KR', value: '"Noto Sans KR", "Malgun Gothic", sans-serif' },
      { name: '맑은 고딕', value: '"Malgun Gothic", "맑은 고딕", sans-serif' },
      { name: 'Pretendard', value: 'system-ui, -apple-system, sans-serif' },
      { name: 'Apple SD 산돌고딕 Neo', value: '"Apple SD Gothic Neo", "Apple SD 산돌고딕 Neo", sans-serif' },
      { name: '나눔고딕', value: '"Nanum Gothic", "나눔고딕", sans-serif' },
      { name: 'Arial', value: 'Arial, sans-serif' },
      { name: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
    ]
  },
  {
    category: '명조계열',
    fonts: [
      { name: '바탕체', value: '"Batang", "바탕체", serif' },
      { name: '애플명조', value: '"Apple Myungjo", "애플명조", serif' },
      { name: '나눔명조', value: '"Nanum Myeongjo", "나눔명조", serif' },
      { name: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
    ]
  },
  {
    category: '필기 / 특수',
    fonts: [
      { name: '궁서체', value: '"Gungsuh", "궁서체", cursive' },
      { name: '코딩 고정폭', value: 'Consolas, Monaco, monospace' },
    ]
  }
];

export function detectPerimeterDominantColor(canvas: HTMLCanvasElement): '#ffffff' | '#000000' {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) return '#ffffff';

    const w = canvas.width;
    const h = canvas.height;
    const borderThickness = Math.max(1, Math.min(10, Math.round(Math.min(w, h) * 0.05)));

    let totalLum = 0;
    let count = 0;

    const topImg = ctx.getImageData(0, 0, w, borderThickness);
    const bottomImg = ctx.getImageData(0, Math.max(0, h - borderThickness), w, borderThickness);
    const leftImg = ctx.getImageData(0, 0, borderThickness, h);
    const rightImg = ctx.getImageData(Math.max(0, w - borderThickness), 0, borderThickness, h);

    const sampleData = (data: Uint8ClampedArray) => {
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 32) continue; // skip transparent pixels
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalLum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        count++;
      }
    };

    sampleData(topImg.data);
    sampleData(bottomImg.data);
    sampleData(leftImg.data);
    sampleData(rightImg.data);

    if (count === 0) return '#ffffff';
    const avgLum = totalLum / count;
    return avgLum >= 0.5 ? '#ffffff' : '#000000';
  } catch {
    return '#ffffff';
  }
}

export interface TextItem {
  id: string;
  text: string;
  x: number; // natural canvas px
  y: number; // natural canvas px
  fontSize: number;
  fontFamily: string;
  color: string;
  opacity: number;
  hasBackground: boolean;
  backgroundColor: string;
  backgroundRadius: number;
  borderWidth: number;
  borderColor: string;
  borderStyle: 'solid' | 'dashed' | 'dotted';
}

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

  // Tool: 자유 변형 (Free Transform: 왜곡 / 원근 / 기울이기 / 원근 자르기)
  const [transformMode, setTransformMode] = useState<'crop' | 'distort' | 'perspective' | 'skew' | null>(null);
  const [transformSelectionRect, setTransformSelectionRect] = useState<CropRect | null>(null);
  const [isSelectingTransformRect, setIsSelectingTransformRect] = useState<boolean>(false);
  const transformRectStartPos = useRef<{ x: number; y: number } | null>(null);
  const [transformQuad, setTransformQuad] = useState<QuadPoints | null>(null);
  const [transformSkewX, setTransformSkewX] = useState<number>(0);
  const [transformSkewY, setTransformSkewY] = useState<number>(0);
  const [transformBgMode, setTransformBgMode] = useState<'transparent' | 'white' | 'black'>('transparent');
  const [transformAutoFit, setTransformAutoFit] = useState<boolean>(false);
  const [transformInteraction, setTransformInteraction] = useState<
    'none' | 'tl' | 'tr' | 'br' | 'bl' | 'body'
  >('none');
  const transformDragStart = useRef<{
    clientX: number;
    clientY: number;
    initialQuad: QuadPoints;
    isCtrl: boolean;
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

  // Panel Collapse States
  const [isPaletteCollapsed, setIsPaletteCollapsed] = useState<boolean>(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState<boolean>(false);

  // Tool 4: 회전 / 반전 (Rotate & Fine Angle & Guide Lines)
  const [fineAngle, setFineAngle] = useState<number>(0);
  const [showGuidelines, setShowGuidelines] = useState<boolean>(false);
  const [showGridLines, setShowGridLines] = useState<boolean>(false);
  const [guideLineYPct, setGuideLineYPct] = useState<number>(50); // horizontal
  const [guideLineXPct, setGuideLineXPct] = useState<number>(50); // vertical
  const isDraggingGuideLineY = useRef<boolean>(false);
  const isDraggingGuideLineX = useRef<boolean>(false);

  // Tool: 배경색 조정 (흰색 배경 투명화 등)
  const [bgColorTarget, setBgColorTarget] = useState<string>('#ffffff');
  const [bgColorTolerance, setBgColorTolerance] = useState<number>(18);
  const [bgColorSmoothness, setBgColorSmoothness] = useState<number>(6);
  const [bgColorContiguous, setBgColorContiguous] = useState<boolean>(true); // default true for edge background removal
  const [bgColorReplaceMode, setBgColorReplaceMode] = useState<'transparent' | 'replace'>('transparent');
  const [bgColorNewColor, setBgColorNewColor] = useState<string>('#ffffff');
  const [isBgColorModified, setIsBgColorModified] = useState<boolean>(false);
  const [selectedBgPreset, setSelectedBgPreset] = useState<'white' | 'black' | 'all-white' | 'chroma' | null>(null);

  // Tool: 톤 커브 (Curves)
  const [curveBlacks, setCurveBlacks] = useState<number>(0);
  const [curveShadows, setCurveShadows] = useState<number>(0);
  const [curveMidtones, setCurveMidtones] = useState<number>(0);
  const [curveHighlights, setCurveHighlights] = useState<number>(0);
  const [curveWhites, setCurveWhites] = useState<number>(255);

  // Tool 5: 색상 보정 (Color)
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);

  // Tool 6: 선명도 (Sharpen)
  const [sharpenAmount, setSharpenAmount] = useState<number>(0);

  // Tool 7: 타일링 / 블러 (Mosaic / Blur)
  const [activeMosaicMode, setActiveMosaicMode] = useState<'mosaic' | 'blur' | null>(null);
  const [mosaicSize, setMosaicSize] = useState<number>(14);
  const [mosaicSelection, setMosaicSelection] = useState<CropRect | null>(null);
  const [isSelectingMosaic, setIsSelectingMosaic] = useState<boolean>(false);
  const mosaicStartPos = useRef<{ x: number; y: number } | null>(null);

  
  // Tool 8: 텍스트 (Text Items Layer)
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Active/selected text item fields for current edit
  const [textString, setTextString] = useState<string>('텍스트 입력');
  const [textSize, setTextSize] = useState<number>(36);
  const [textColor, setTextColor] = useState<string>('#ffffff');
  const [textOpacity, setTextOpacity] = useState<number>(1.0); // 기본 투명도 100%
  const [textFont, setTextFont] = useState<string>('"Noto Sans KR", "Malgun Gothic", sans-serif');
  const [textPos, setTextPos] = useState<{ x: number; y: number }>({ x: 40, y: 80 });
  const [hasTextBg, setHasTextBg] = useState<boolean>(false);
  const [textBgColor, setTextBgColor] = useState<string>('#000000');
  const [textBorderRadius, setTextBorderRadius] = useState<number>(8);
  const [textBorderWidth, setTextBorderWidth] = useState<number>(0);
  const [textBorderColor, setTextBorderColor] = useState<string>('#ffffff');
  const [textBorderStyle, setTextBorderStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');

  const [isDraggingText, setIsDraggingText] = useState<boolean>(false);
  const draggingTextIdRef = useRef<string | null>(null);
  const textDragStart = useRef<{ clientX: number; clientY: number; initialPos: { x: number; y: number } } | null>(null);

  // Tool: 선명도 & 텍스트 굵게 & 블러
  const [textThickenStrength, setTextThickenStrength] = useState<number>(0);

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
  const shouldFitOnImageLoadRef = useRef<boolean>(false);

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

  const pickColorFromEyeDropper = async (callback: (hex: string) => void) => {
    if ((window as any).EyeDropper) {
      try {
        const eyeDropper = new (window as any).EyeDropper();
        const res = await eyeDropper.open();
        if (res && res.sRGBHex) {
          callback(res.sRGBHex);
        }
      } catch {
        // cancelled
      }
    } else {
      alert('현재 브라우저에서는 화면 스포이트 기능이 지원되지 않습니다.');
    }
  };

  // Push state to history
  const pushHistory = (canvas: HTMLCanvasElement) => {
    setHistory((prev) => [...prev.slice(-25), cloneCanvas(canvas)]);
    setRedoStack([]);
  };

  // Calculate scale for fitting canvas inside viewport with padding
  const calculateFitScale = useCallback((canvasW: number, canvasH: number): number => {
    if (canvasW <= 0 || canvasH <= 0) return 1.0;
    let availW = 800;
    let availH = 600;

    if (viewportContainerRef.current) {
      const vpRect = viewportContainerRef.current.getBoundingClientRect();
      if (vpRect.width > 0 && vpRect.height > 0) {
        availW = Math.max(100, vpRect.width - 64);
        availH = Math.max(100, vpRect.height - 64);
      }
    } else if (typeof window !== 'undefined') {
      availW = Math.max(100, (window.innerWidth || 1200) - 80);
      availH = Math.max(100, (window.innerHeight || 800) - 160);
    }

    const scaleW = availW / canvasW;
    const scaleH = availH / canvasH;
    const fitScale = Math.min(scaleW, scaleH, 1.0);
    return Number(Math.max(0.05, fitScale).toFixed(2));
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!currentCanvas) return;
    const fitScale = calculateFitScale(currentCanvas.width, currentCanvas.height);
    setZoomLevel(fitScale);
    setPanOffset({ x: 0, y: 0 });
  }, [currentCanvas, calculateFitScale]);

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
        shouldFitOnImageLoadRef.current = true;
        const initFit = calculateFitScale(img.naturalWidth, img.naturalHeight);
        setZoomLevel(initFit);
        setPanOffset({ x: 0, y: 0 });
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
        setTransformMode(null);
        setTransformSelectionRect(null);
        setTransformQuad(null);
        setTransformSkewX(0);
        setTransformSkewY(0);
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

    if (activeTool === 'bgcolor' && isBgColorModified) {
      preview = applyBackgroundColorAdjustment(currentCanvas, {
        targetColor: bgColorTarget,
        tolerance: bgColorTolerance,
        smoothness: bgColorSmoothness,
        contiguous: bgColorContiguous,
        replaceMode: bgColorReplaceMode,
        newColor: bgColorNewColor
      });
    } else if (activeTool === 'color' && (brightness !== 0 || contrast !== 0 || saturation !== 0)) {
      preview = applyColorAdjustments(currentCanvas, { brightness, contrast, saturation });
    } else if (
      activeTool === 'curves' &&
      (curveBlacks !== 0 || curveShadows !== 0 || curveMidtones !== 0 || curveHighlights !== 0 || curveWhites !== 255)
    ) {
      const lut = generateToneCurveLUT(curveBlacks, curveShadows, curveMidtones, curveHighlights, curveWhites);
      preview = applyToneCurves(currentCanvas, lut);
    } else if (activeTool === 'sharpen') {
      if (sharpenAmount > 0) {
        preview = applySharpen(preview, sharpenAmount);
      }
      if (textThickenStrength > 0) {
        preview = applyTextStrokeThicken(preview, textThickenStrength);
      }
      if (activeMosaicMode && mosaicSelection && mosaicSelection.width > 2 && mosaicSelection.height > 2) {
        preview = applyRegionMosaic(preview, { type: activeMosaicMode, rect: mosaicSelection, size: mosaicSize });
      }
    } else if (activeTool === 'canvas') {
      if (
        canvasTargetW > 0 &&
        canvasTargetH > 0 &&
        (canvasTargetW !== currentCanvas.width || canvasTargetH !== currentCanvas.height || canvasBgColor !== 'transparent')
      ) {
        preview = applyCanvasSizeWithAnchor(
          currentCanvas,
          canvasTargetW,
          canvasTargetH,
          canvasAnchor.row,
          canvasAnchor.col,
          canvasBgColor
        );
      }
    } else if (activeTool === 'transform') {
      if (transformMode === 'skew') {
        if (transformSkewX !== 0 || transformSkewY !== 0) {
          preview = applySkew(currentCanvas, transformSkewX, transformSkewY, transformBgMode);
        }
      } else if (transformMode === 'distort' || transformMode === 'perspective') {
        if (transformQuad) {
          const w = currentCanvas.width;
          const h = currentCanvas.height;
          const isQuadModified =
            Math.abs(transformQuad.tl.x) > 1 || Math.abs(transformQuad.tl.y) > 1 ||
            Math.abs(transformQuad.tr.x - w) > 1 || Math.abs(transformQuad.tr.y) > 1 ||
            Math.abs(transformQuad.br.x - w) > 1 || Math.abs(transformQuad.br.y - h) > 1 ||
            Math.abs(transformQuad.bl.x) > 1 || Math.abs(transformQuad.bl.y - h) > 1;
          if (isQuadModified) {
            preview = applyPerspectiveDistort(currentCanvas, transformQuad, {
              bgMode: transformBgMode,
              autoFitBounds: transformAutoFit
            });
          }
        }
      }
    } else if (activeTool === 'border' && (borderRadius > 0 || borderWidth > 0)) {
      preview = applyBorderAndRadius(currentCanvas, { radius: borderRadius, borderWidth, borderColor });
    } else if (activeTool === 'mosaic' && mosaicSelection && mosaicSelection.width > 2 && mosaicSelection.height > 2) {
      preview = applyRegionMosaic(currentCanvas, { type: activeMosaicMode || 'mosaic', rect: mosaicSelection, size: mosaicSize });
    }

    disp.width = preview.width;
    disp.height = preview.height;
    const ctx = disp.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, disp.width, disp.height);
      ctx.drawImage(preview, 0, 0);

      // Live selection outline for mosaic tool
      if ((activeTool === 'mosaic' || (activeTool === 'sharpen' && activeMosaicMode !== null)) && mosaicSelection) {
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
    isBgColorModified,
    bgColorTarget,
    bgColorTolerance,
    bgColorSmoothness,
    bgColorContiguous,
    bgColorReplaceMode,
    bgColorNewColor,
    brightness,
    contrast,
    saturation,
    curveBlacks,
    curveShadows,
    curveMidtones,
    curveHighlights,
    curveWhites,
    sharpenAmount,
    textThickenStrength,
    canvasTargetW,
    canvasTargetH,
    canvasAnchor,
    canvasBgColor,
    transformMode,
    transformQuad,
    transformSkewX,
    transformSkewY,
    transformBgMode,
    transformAutoFit,
    borderRadius,
    borderWidth,
    borderColor,
    mosaicSelection,
    activeMosaicMode,
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
    setTextThickenStrength(0);
    setActiveMosaicMode(null);
    setBorderRadius(0);
    setBorderWidth(0);
    setFineAngle(0);
    setCurveBlacks(0);
    setCurveShadows(0);
    setCurveMidtones(0);
    setCurveHighlights(0);
    setCurveWhites(255);
    setBgColorTarget('#ffffff');
    setBgColorTolerance(18);
    setBgColorSmoothness(6);
    setBgColorContiguous(true);
    setBgColorReplaceMode('transparent');
    setIsBgColorModified(false);
    setSelectedBgPreset(null);
  };

  // Delete Image
  const handleDeleteImage = () => {
    setImageFile(null);
    setCurrentCanvas(null);
    setOriginalCanvas(null);
    setHistory([]);
    setRedoStack([]);
    setMosaicSelection(null);
    setTextThickenStrength(0);
    setActiveMosaicMode(null);
    setFineAngle(0);
    setCurveBlacks(0);
    setCurveShadows(0);
    setCurveMidtones(0);
    setCurveHighlights(0);
    setCurveWhites(255);
    setBgColorTarget('#ffffff');
    setBgColorTolerance(18);
    setBgColorSmoothness(6);
    setBgColorContiguous(true);
    setBgColorReplaceMode('transparent');
    setIsBgColorModified(false);
    setSelectedBgPreset(null);
  };

  const handleApplyBgColor = () => {
    if (!currentCanvas) return;
    pushHistory(currentCanvas);
    const adjusted = applyBackgroundColorAdjustment(currentCanvas, {
      targetColor: bgColorTarget,
      tolerance: bgColorTolerance,
      smoothness: bgColorSmoothness,
      contiguous: bgColorContiguous,
      replaceMode: bgColorReplaceMode,
      newColor: bgColorNewColor
    });
    setCurrentCanvas(adjusted);
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

  const handleCropToleranceChange = (newTolerance: number) => {
    setCropTolerance(newTolerance);
    if (currentCanvas) {
      const autoRes = detectAutoCropBounds(currentCanvas, { tolerance: newTolerance });
      if (autoRes.rect.width > 0 && autoRes.rect.height > 0) {
        setCropRect(autoRes.rect);
      }
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
  // Tool: 자유 변형 (Free Transform) Handlers
  // -------------------------------------------------------------
  const initTransformQuad = useCallback((canvas: HTMLCanvasElement | null, mode: 'crop' | 'distort' | 'perspective' | 'skew', rect?: CropRect | null) => {
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    const baseRect = rect && rect.width > 5 && rect.height > 5
      ? rect
      : { x: 0, y: 0, width: w, height: h };

    setTransformQuad({
      tl: { x: baseRect.x, y: baseRect.y },
      tr: { x: baseRect.x + baseRect.width, y: baseRect.y },
      br: { x: baseRect.x + baseRect.width, y: baseRect.y + baseRect.height },
      bl: { x: baseRect.x, y: baseRect.y + baseRect.height }
    });
  }, []);

  const handleChooseTransformMode = (mode: 'crop' | 'distort' | 'perspective' | 'skew') => {
    if (!currentCanvas) return;
    setTransformMode(mode);
    setTransformSkewX(0);
    setTransformSkewY(0);
    if (transformSelectionRect && transformSelectionRect.width > 5 && transformSelectionRect.height > 5) {
      initTransformQuad(currentCanvas, mode, transformSelectionRect);
    } else if (transformQuad) {
      // 이미 지정된 영역이 있는 경우 현재 쿼드 유지
    } else {
      setTransformQuad(null);
    }
  };

  const handleResetTransformSelection = () => {
    setTransformQuad(null);
    setTransformSelectionRect(null);
    setTransformSkewX(0);
    setTransformSkewY(0);
  };

  const handleSelectEntireCanvasForTransform = () => {
    if (!currentCanvas) return;
    const fullRect: CropRect = { x: 0, y: 0, width: currentCanvas.width, height: currentCanvas.height };
    setTransformSelectionRect(fullRect);
    const mode = transformMode || 'crop';
    if (!transformMode) {
      setTransformMode('crop');
    }
    initTransformQuad(currentCanvas, mode, fullRect);
  };

  const handleApplyTransform = useCallback(() => {
    if (!currentCanvas || currentCanvas.width <= 0 || currentCanvas.height <= 0 || !transformMode) return;

    if (transformMode === 'crop') {
      if (!transformQuad) return;
      pushHistory(currentCanvas);
      const res = applyPerspectiveCrop(currentCanvas, transformQuad, { bgMode: transformBgMode });
      setCurrentCanvas(res);
      setTargetWidth(res.width);
      setTargetHeight(res.height);
      setCanvasTargetW(res.width);
      setCanvasTargetH(res.height);
      setCropRect({ x: 0, y: 0, width: res.width, height: res.height });
      setTransformMode(null);
      setTransformQuad(null);
      setTransformSelectionRect(null);
      requestAnimationFrame(() => handleFitToScreen());
    } else if (transformMode === 'distort' || transformMode === 'perspective') {
      if (!transformQuad) return;
      pushHistory(currentCanvas);
      const res = applyPerspectiveDistort(currentCanvas, transformQuad, {
        bgMode: transformBgMode,
        autoFitBounds: transformAutoFit
      });
      setCurrentCanvas(res);
      setTargetWidth(res.width);
      setTargetHeight(res.height);
      setCanvasTargetW(res.width);
      setCanvasTargetH(res.height);
      setCropRect({ x: 0, y: 0, width: res.width, height: res.height });
      setTransformMode(null);
      setTransformQuad(null);
      setTransformSelectionRect(null);
      requestAnimationFrame(() => handleFitToScreen());
    } else if (transformMode === 'skew') {
      if (transformSkewX === 0 && transformSkewY === 0) return;
      pushHistory(currentCanvas);
      const res = applySkew(currentCanvas, transformSkewX, transformSkewY, transformBgMode);
      setCurrentCanvas(res);
      setTargetWidth(res.width);
      setTargetHeight(res.height);
      setCanvasTargetW(res.width);
      setCanvasTargetH(res.height);
      setCropRect({ x: 0, y: 0, width: res.width, height: res.height });
      setTransformSkewX(0);
      setTransformSkewY(0);
      setTransformMode(null);
      setTransformQuad(null);
      setTransformSelectionRect(null);
      requestAnimationFrame(() => handleFitToScreen());
    }
  }, [currentCanvas, transformMode, transformQuad, transformBgMode, transformAutoFit, transformSkewX, transformSkewY, pushHistory, handleFitToScreen]);

  const handleResetTransform = () => {
    if (currentCanvas && transformMode) {
      initTransformQuad(currentCanvas, transformMode, transformSelectionRect);
      setTransformSkewX(0);
      setTransformSkewY(0);
    }
  };

  const handleTransformHandlePointerDown = (
    e: React.PointerEvent,
    action: 'tl' | 'tr' | 'br' | 'bl' | 'body'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!transformQuad) {
      if (currentCanvas && transformMode) initTransformQuad(currentCanvas, transformMode, transformSelectionRect);
      return;
    }
    setTransformInteraction(action);
    transformDragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initialQuad: {
        tl: { ...transformQuad.tl },
        tr: { ...transformQuad.tr },
        br: { ...transformQuad.br },
        bl: { ...transformQuad.bl }
      },
      isCtrl: e.ctrlKey || e.metaKey
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleTransformHandlePointerMove = (e: React.PointerEvent) => {
    if (transformInteraction === 'none' || !transformDragStart.current || !currentCanvas || !displayCanvasRef.current || !transformQuad) return;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const scaleX = currentCanvas.width / Math.max(1, rect.width);
    const scaleY = currentCanvas.height / Math.max(1, rect.height);
    const dx = (e.clientX - transformDragStart.current.clientX) * scaleX;
    const dy = (e.clientY - transformDragStart.current.clientY) * scaleY;
    const init = transformDragStart.current.initialQuad;
    const isCtrl = e.ctrlKey || e.metaKey || transformDragStart.current.isCtrl;

    const nextQuad: QuadPoints = {
      tl: { ...init.tl },
      tr: { ...init.tr },
      br: { ...init.br },
      bl: { ...init.bl }
    };

    if (transformInteraction === 'body') {
      nextQuad.tl = { x: Math.round(init.tl.x + dx), y: Math.round(init.tl.y + dy) };
      nextQuad.tr = { x: Math.round(init.tr.x + dx), y: Math.round(init.tr.y + dy) };
      nextQuad.br = { x: Math.round(init.br.x + dx), y: Math.round(init.br.y + dy) };
      nextQuad.bl = { x: Math.round(init.bl.x + dx), y: Math.round(init.bl.y + dy) };
    } else if (transformMode === 'perspective' && !isCtrl) {
      if (transformInteraction === 'tl') {
        nextQuad.tl = { x: Math.round(init.tl.x + dx), y: Math.round(init.tl.y + dy) };
        nextQuad.tr = { x: Math.round(init.tr.x - dx), y: Math.round(init.tr.y + dy) };
      } else if (transformInteraction === 'tr') {
        nextQuad.tr = { x: Math.round(init.tr.x + dx), y: Math.round(init.tr.y + dy) };
        nextQuad.tl = { x: Math.round(init.tl.x - dx), y: Math.round(init.tl.y + dy) };
      } else if (transformInteraction === 'bl') {
        nextQuad.bl = { x: Math.round(init.bl.x + dx), y: Math.round(init.bl.y + dy) };
        nextQuad.br = { x: Math.round(init.br.x - dx), y: Math.round(init.br.y + dy) };
      } else if (transformInteraction === 'br') {
        nextQuad.br = { x: Math.round(init.br.x + dx), y: Math.round(init.br.y + dy) };
        nextQuad.bl = { x: Math.round(init.bl.x - dx), y: Math.round(init.bl.y + dy) };
      }
    } else {
      if (transformInteraction === 'tl') {
        nextQuad.tl = { x: Math.round(init.tl.x + dx), y: Math.round(init.tl.y + dy) };
      } else if (transformInteraction === 'tr') {
        nextQuad.tr = { x: Math.round(init.tr.x + dx), y: Math.round(init.tr.y + dy) };
      } else if (transformInteraction === 'br') {
        nextQuad.br = { x: Math.round(init.br.x + dx), y: Math.round(init.br.y + dy) };
      } else if (transformInteraction === 'bl') {
        nextQuad.bl = { x: Math.round(init.bl.x + dx), y: Math.round(init.bl.y + dy) };
      }
    }

    setTransformQuad(nextQuad);
  };

  const handleTransformHandlePointerUp = (e: React.PointerEvent) => {
    if (transformInteraction !== 'none') {
      setTransformInteraction('none');
      transformDragStart.current = null;
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

  const renderAnchorArrow = (r: number, c: number) => {
    if (r === canvasAnchor.row && c === canvasAnchor.col) return null;
    const dr = r - canvasAnchor.row;
    const dc = c - canvasAnchor.col;
    const isShrink = currentCanvas
      ? (canvasTargetW < currentCanvas.width && dc !== 0) || (canvasTargetH < currentCanvas.height && dr !== 0)
      : false;

    const effDr = isShrink ? -dr : dr;
    const effDc = isShrink ? -dc : dc;

    const iconProps = { className: "w-5 h-5", strokeWidth: 2.5 };

    if (effDr === -1 && effDc === -1) return <ArrowUpLeft {...iconProps} />;
    if (effDr === -1 && effDc === 0) return <ArrowUp {...iconProps} />;
    if (effDr === -1 && effDc === 1) return <ArrowUpRight {...iconProps} />;
    if (effDr === 0 && effDc === -1) return <ArrowLeft {...iconProps} />;
    if (effDr === 0 && effDc === 1) return <ArrowRight {...iconProps} />;
    if (effDr === 1 && effDc === -1) return <ArrowDownLeft {...iconProps} />;
    if (effDr === 1 && effDc === 0) return <ArrowDown {...iconProps} />;
    if (effDr === 1 && effDc === 1) return <ArrowDownRight {...iconProps} />;
    return null;
  };

  // -------------------------------------------------------------
  // Tool 4: 회전 / 반전 Handlers (1도 미세 회전, 기준선, 90° 회전, 반전)
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

  const handleApplyFineRotate = () => {
    if (!currentCanvas || fineAngle === 0) return;
    pushHistory(currentCanvas);
    const rotated = applyRotationAndFlip(currentCanvas, fineAngle, false, false);
    setCurrentCanvas(rotated);
    setTargetWidth(rotated.width);
    setTargetHeight(rotated.height);
    setCanvasTargetW(rotated.width);
    setCanvasTargetH(rotated.height);
    setCropRect({ x: 0, y: 0, width: rotated.width, height: rotated.height });
    setFineAngle(0);
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
    const totalAngle = fineAngle + angle;
    setFineAngle(0);
    setAnimTransform({
      rotate: angle === 270 ? -90 : angle,
      scaleX: 1,
      scaleY: 1,
      isTransitioning: true
    });
    setTimeout(() => {
      handleApplyRotate(totalAngle);
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

  // Guideline pointer handlers (Horizontal & Vertical)
  const handleGuideLineHPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingGuideLineY.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const handleGuideLineVPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDraggingGuideLineX.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const handleGuideLinePointerMove = (e: React.PointerEvent) => {
    const canvasEl = displayCanvasRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) return;

    if (isDraggingGuideLineY.current) {
      const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
      const pct = ((clampedY - rect.top) / rect.height) * 100;
      setGuideLineYPct(Math.round(Math.max(0, Math.min(100, pct))));
    }

    if (isDraggingGuideLineX.current) {
      const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const pct = ((clampedX - rect.left) / rect.width) * 100;
      setGuideLineXPct(Math.round(Math.max(0, Math.min(100, pct))));
    }
  };

  const handleGuideLinePointerUp = (e: React.PointerEvent) => {
    if (isDraggingGuideLineY.current || isDraggingGuideLineX.current) {
      isDraggingGuideLineY.current = false;
      isDraggingGuideLineX.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // Tool: 톤 커브 (Curves) Handler
  const isCurveModified =
    curveBlacks !== 0 ||
    curveShadows !== 0 ||
    curveMidtones !== 0 ||
    curveHighlights !== 0 ||
    curveWhites !== 255;

  const handleApplyCurves = () => {
    if (!currentCanvas || !isCurveModified) return;
    pushHistory(currentCanvas);
    const lut = generateToneCurveLUT(curveBlacks, curveShadows, curveMidtones, curveHighlights, curveWhites);
    const curved = applyToneCurves(currentCanvas, lut);
    setCurrentCanvas(curved);
    setCurveBlacks(0);
    setCurveShadows(0);
    setCurveMidtones(0);
    setCurveHighlights(0);
    setCurveWhites(255);
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
    } else if (activeTool === 'rotate') {
      if (fineAngle !== 0) {
        handleApplyFineRotate();
      }
    } else if (activeTool === 'bgcolor') {
      if (isBgColorModified) {
        handleApplyBgColor();
        setIsBgColorModified(false);
        setSelectedBgPreset(null);
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
    } else if (activeTool === 'curves') {
      if (curveBlacks !== 0 || curveShadows !== 0 || curveMidtones !== 0 || curveHighlights !== 0 || curveWhites !== 255) {
        handleApplyCurves();
      }
    } else if (activeTool === 'sharpen') {
      const hasSharpen = sharpenAmount > 0;
      const hasThicken = textThickenStrength > 0;
      const hasMosaic = activeMosaicMode && mosaicSelection && mosaicSelection.width > 2 && mosaicSelection.height > 2;

      if (hasSharpen || hasThicken || hasMosaic) {
        pushHistory(currentCanvas);
        let res = currentCanvas;
        if (hasSharpen) {
          res = applySharpen(res, sharpenAmount);
        }
        if (hasThicken) {
          res = applyTextStrokeThicken(res, textThickenStrength);
        }
        if (hasMosaic) {
          res = applyRegionMosaic(res, {
            type: activeMosaicMode,
            rect: mosaicSelection,
            size: mosaicSize
          });
        }
        setCurrentCanvas(res);
        setSharpenAmount(0);
        setTextThickenStrength(0);
        setMosaicSelection(null);
        setActiveMosaicMode(null);
      }
    } else if (activeTool === 'mosaic') {
      if (mosaicSelection && mosaicSelection.width > 2 && mosaicSelection.height > 2) {
        pushHistory(currentCanvas);
        const processed = applyRegionMosaic(currentCanvas, {
          type: activeMosaicMode || 'mosaic',
          rect: mosaicSelection,
          size: mosaicSize
        });
        setCurrentCanvas(processed);
        setMosaicSelection(null);
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
    } else if (activeTool === 'transform') {
      handleApplyTransform();
    }
  };

  // Tool Switching: Automatically commits current tool's pending changes!
  const handleSelectTool = (newTool: ActiveTool) => {
    if (newTool === activeTool) return;
    if ((activeTool as string) !== 'text' && (activeTool as string) !== 'transform') {
      handleApplyCurrentTool();
    }
    if (activeTool === 'bgcolor') {
      setIsBgColorModified(false);
      setSelectedBgPreset(null);
    }
    if (activeTool === 'sharpen') {
      setActiveMosaicMode(null);
      setMosaicSelection(null);
    }
    if (newTool === 'transform') {
      setTransformMode(null);
      setTransformQuad(null);
      setTransformSelectionRect(null);
      setTransformSkewX(0);
      setTransformSkewY(0);
    }
    setActiveTool(newTool);
  };

  // Automatically fit canvas to screen when a new image is loaded and viewport is ready
  useEffect(() => {
    if (shouldFitOnImageLoadRef.current && currentCanvas) {
      shouldFitOnImageLoadRef.current = false;
      const rafId = requestAnimationFrame(() => {
        handleFitToScreen();
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [currentCanvas, handleFitToScreen]);

  const handleResetTo100 = useCallback(() => {
    setZoomLevel(1.0); // 100% 1:1 original pixel actual size
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Zoom & Pan Handlers
  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoomLevel((prev) => Math.max(0.1, Math.min(5.0, Number((prev + delta).toFixed(2)))));
  };

  const handleViewportBgPointerDown = (e: React.PointerEvent) => {
    if (activeTool === 'mosaic' || (activeTool === 'sharpen' && activeMosaicMode !== null)) return;

    // In transform mode before area is designated: only pan if clicking outside the image!
    if (activeTool === 'transform' && transformQuad === null) {
      const rect = displayCanvasRef.current?.getBoundingClientRect();
      const isInsideImage = rect && (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      if (isInsideImage) return; // Inside image -> do not pan, allow transform rect selection
    }

    if (e.pointerType === 'touch' || e.button === 0 || e.button === 1 || e.altKey) {
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

    if (activeTool === 'text') {
      setSelectedTextId(null);
    }

    const canSelectMosaic = activeTool === 'mosaic' || (activeTool === 'sharpen' && activeMosaicMode !== null);
    if (canSelectMosaic) {
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

    const canSelectTransformRect = activeTool === 'transform' && transformQuad === null;
    if (canSelectTransformRect) {
      const rect = displayCanvasRef.current.getBoundingClientRect();
      const isInsideImage = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      // Only select transform area if clicking inside the image!
      if (!isInsideImage) return;

      const scaleX = currentCanvas.width / Math.max(1, rect.width);
      const scaleY = currentCanvas.height / Math.max(1, rect.height);
      const imgX = Math.max(0, Math.min(currentCanvas.width, (e.clientX - rect.left) * scaleX));
      const imgY = Math.max(0, Math.min(currentCanvas.height, (e.clientY - rect.top) * scaleY));

      setIsSelectingTransformRect(true);
      transformRectStartPos.current = { x: imgX, y: imgY };
      setTransformSelectionRect({ x: imgX, y: imgY, width: 0, height: 0 });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const canSelectMosaic = activeTool === 'mosaic' || (activeTool === 'sharpen' && activeMosaicMode !== null);
    if (canSelectMosaic && isSelectingMosaic && mosaicStartPos.current && currentCanvas && displayCanvasRef.current) {
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

    const canSelectTransformRect = activeTool === 'transform' && transformQuad === null;
    if (canSelectTransformRect && isSelectingTransformRect && transformRectStartPos.current && currentCanvas && displayCanvasRef.current) {
      const rect = displayCanvasRef.current.getBoundingClientRect();
      const scaleX = currentCanvas.width / Math.max(1, rect.width);
      const scaleY = currentCanvas.height / Math.max(1, rect.height);
      const currX = Math.max(0, Math.min(currentCanvas.width, (e.clientX - rect.left) * scaleX));
      const currY = Math.max(0, Math.min(currentCanvas.height, (e.clientY - rect.top) * scaleY));

      const x = Math.min(transformRectStartPos.current.x, currX);
      const y = Math.min(transformRectStartPos.current.y, currY);
      const width = Math.abs(currX - transformRectStartPos.current.x);
      const height = Math.abs(currY - transformRectStartPos.current.y);

      setTransformSelectionRect({
        x: Math.round(Math.max(0, x)),
        y: Math.round(Math.max(0, y)),
        width: Math.round(Math.min(currentCanvas.width - x, width)),
        height: Math.round(Math.min(currentCanvas.height - y, height))
      });
    }
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const canSelectMosaic = activeTool === 'mosaic' || (activeTool === 'sharpen' && activeMosaicMode !== null);
    if (canSelectMosaic && isSelectingMosaic) {
      setIsSelectingMosaic(false);
      mosaicStartPos.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }

    const canSelectTransformRect = activeTool === 'transform' && transformQuad === null;
    if (canSelectTransformRect && isSelectingTransformRect) {
      setIsSelectingTransformRect(false);
      if (transformRectStartPos.current && currentCanvas && displayCanvasRef.current) {
        const rect = displayCanvasRef.current.getBoundingClientRect();
        const scaleX = currentCanvas.width / Math.max(1, rect.width);
        const scaleY = currentCanvas.height / Math.max(1, rect.height);
        const currX = Math.max(0, Math.min(currentCanvas.width, (e.clientX - rect.left) * scaleX));
        const currY = Math.max(0, Math.min(currentCanvas.height, (e.clientY - rect.top) * scaleY));

        const x = Math.min(transformRectStartPos.current.x, currX);
        const y = Math.min(transformRectStartPos.current.y, currY);
        const width = Math.abs(currX - transformRectStartPos.current.x);
        const height = Math.abs(currY - transformRectStartPos.current.y);

        const finalRect: CropRect = {
          x: Math.round(Math.max(0, x)),
          y: Math.round(Math.max(0, y)),
          width: Math.round(Math.min(currentCanvas.width - x, width)),
          height: Math.round(Math.min(currentCanvas.height - y, height))
        };

        if (finalRect.width > 10 && finalRect.height > 10) {
          setTransformSelectionRect(finalRect);
          const currentMode = transformMode || 'crop';
          if (!transformMode) {
            setTransformMode(currentMode);
          }
          initTransformQuad(currentCanvas, currentMode, finalRect);
        } else {
          setTransformSelectionRect(null);
        }
      }
      transformRectStartPos.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  // -------------------------------------------------------------
  // Tool 8: 텍스트 (Object-based Text Items Layer Handlers)
  // -------------------------------------------------------------
  const bakeAllTextItemsToCanvas = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    if (textItems.length === 0) return sourceCanvas;
    let res = cloneCanvas(sourceCanvas);
    for (const item of textItems) {
      res = applyTextWatermark(res, {
        text: item.text,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        color: item.color,
        opacity: item.opacity,
        position: 'custom',
        customX: item.x,
        customY: item.y,
        hasBackground: item.hasBackground,
        backgroundColor: item.backgroundColor,
        backgroundRadius: item.backgroundRadius,
        borderWidth: item.borderWidth,
        borderColor: item.borderColor,
        borderStyle: item.borderStyle
      });
    }
    return res;
  };

  // Sample canvas perimeter/outer border to determine default text color (black vs white)
  const getCanvasPerimeterLuminance = useCallback((canvas: HTMLCanvasElement): number => {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return 0.5;

      const w = canvas.width;
      const h = canvas.height;
      const borderThickness = Math.max(2, Math.min(20, Math.round(Math.min(w, h) * 0.05)));

      let totalLum = 0;
      let count = 0;

      // Sample top & bottom borders
      const topImg = ctx.getImageData(0, 0, w, borderThickness);
      const bottomImg = ctx.getImageData(0, Math.max(0, h - borderThickness), w, borderThickness);
      // Sample left & right borders
      const leftImg = ctx.getImageData(0, 0, borderThickness, h);
      const rightImg = ctx.getImageData(Math.max(0, w - borderThickness), 0, borderThickness, h);

      const sampleData = (data: Uint8ClampedArray) => {
        const step = Math.max(4, Math.floor(data.length / 400)) * 4;
        for (let i = 0; i < data.length; i += step) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          totalLum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          count++;
        }
      };

      sampleData(topImg.data);
      sampleData(bottomImg.data);
      sampleData(leftImg.data);
      sampleData(rightImg.data);

      return count > 0 ? totalLum / count : 0.5;
    } catch {
      return 0.5;
    }
  }, []);

  const handleAddTextItem = () => {
    if (!currentCanvas) return;
    const newId = 'txt_' + Date.now();
    const defaultFontSize = Math.max(18, Math.min(72, Math.round(currentCanvas.width / 20)));

    // Calculate default text color based on background luminance
    let isBrightBg = false;
    if (hasTextBg) {
      const hex = textBgColor.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      isBrightBg = lum > 0.5;
    } else {
      const perimLum = getCanvasPerimeterLuminance(currentCanvas);
      isBrightBg = perimLum > 0.5;
    }
    const defaultColor = isBrightBg ? '#000000' : '#ffffff';
    setTextColor(defaultColor);

    const newItem: TextItem = {
      id: newId,
      text: textString.trim() || '텍스트 입력',
      x: Math.round(currentCanvas.width / 2 - 80),
      y: Math.round(currentCanvas.height / 2),
      fontSize: defaultFontSize,
      fontFamily: textFont,
      color: defaultColor,
      opacity: textOpacity,
      hasBackground: hasTextBg,
      backgroundColor: textBgColor,
      backgroundRadius: textBorderRadius,
      borderWidth: textBorderWidth,
      borderColor: textBorderColor,
      borderStyle: textBorderStyle
    };
    setTextItems((prev) => [...prev, newItem]);
    setSelectedTextId(newId);
  };

  const updateSelectedTextProperty = (updates: Partial<TextItem>) => {
    if (!selectedTextId) return;
    setTextItems((prev) =>
      prev.map((item) => (item.id === selectedTextId ? { ...item, ...updates } : item))
    );
  };

  const handleSelectTextItem = (id: string) => {
    setSelectedTextId(id);
    const item = textItems.find((t) => t.id === id);
    if (item) {
      setTextString(item.text);
      setTextSize(item.fontSize);
      setTextFont(item.fontFamily);
      setTextColor(item.color);
      setTextOpacity(item.opacity);
      setHasTextBg(item.hasBackground);
      setTextBgColor(item.backgroundColor);
      setTextBorderRadius(item.backgroundRadius);
      setTextBorderWidth(item.borderWidth);
      setTextBorderColor(item.borderColor);
      setTextBorderStyle(item.borderStyle);
    }
  };

  const handleDeleteTextItem = useCallback((id: string) => {
    setTextItems((prev) => prev.filter((t) => t.id !== id));
    setSelectedTextId((prev) => (prev === id ? null : prev));
  }, []);

  const handleDeleteSelectedText = useCallback(() => {
    if (!selectedTextId) return;
    handleDeleteTextItem(selectedTextId);
  }, [selectedTextId, handleDeleteTextItem]);

  // Keyboard shortcut to delete selected text object (Delete / Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedTextId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        handleDeleteSelectedText();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTextId, handleDeleteSelectedText]);

  const handleTextOverlayPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    handleSelectTextItem(id);
    setIsDraggingText(true);
    draggingTextIdRef.current = id;
    const item = textItems.find((t) => t.id === id);
    if (item) {
      textDragStart.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        initialPos: { x: item.x, y: item.y }
      };
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleTextOverlayPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingText || !textDragStart.current || !draggingTextIdRef.current || !currentCanvas || !displayCanvasRef.current) return;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const scaleX = currentCanvas.width / Math.max(1, rect.width);
    const scaleY = currentCanvas.height / Math.max(1, rect.height);
    const dx = (e.clientX - textDragStart.current.clientX) * scaleX;
    const dy = (e.clientY - textDragStart.current.clientY) * scaleY;

    const newX = Math.round(textDragStart.current.initialPos.x + dx);
    const newY = Math.round(textDragStart.current.initialPos.y + dy);

    setTextItems((prev) =>
      prev.map((item) => (item.id === draggingTextIdRef.current ? { ...item, x: newX, y: newY } : item))
    );
  };

  const handleTextOverlayPointerUp = (e: React.PointerEvent) => {
    if (isDraggingText) {
      setIsDraggingText(false);
      draggingTextIdRef.current = null;
      textDragStart.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
    }
  };

  const handleBakeText = () => {
    if (!currentCanvas || textItems.length === 0) return;
    pushHistory(currentCanvas);
    const baked = bakeAllTextItemsToCanvas(currentCanvas);
    setCurrentCanvas(baked);
    setTextItems([]);
    setSelectedTextId(null);
  };

  // -------------------------------------------------------------
  // Save & Download Trigger
  // -------------------------------------------------------------
  const handleExecuteSave = async () => {
    if (!currentCanvas) return;
    try {
      setIsProcessing(true);
      const mime = exportFormat === 'jpeg' ? 'image/jpeg' : exportFormat === 'webp' ? 'image/webp' : 'image/png';
      const finalCanvas = bakeAllTextItemsToCanvas(currentCanvas);
      const dataUrl = finalCanvas.toDataURL(mime, exportQuality);
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
      const finalCanvas = bakeAllTextItemsToCanvas(currentCanvas);
      const success = await copyImageBlobToClipboard(finalCanvas, {
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
    { id: 'transform', label: '자유 변형', icon: Scan },
    { id: 'resize', label: '이미지 크기', icon: Scaling },
    { id: 'canvas', label: '캔버스 크기', icon: Maximize2 },
    { id: 'rotate', label: '회전 / 반전', icon: RotateCw },
    { id: 'bgcolor', label: '배경색 조정', icon: Eraser },
    { id: 'color', label: '색상 보정', icon: Sliders },
    { id: 'curves', label: '톤 커브', icon: Activity },
    { id: 'sharpen', label: '선명도 / 블러', icon: Sparkles },
    { id: 'text', label: '텍스트', icon: Type },
    { id: 'border', label: '외곽효과', icon: Square },
  ] as const;

  return (
    <div className="w-full space-y-2">
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

      {/* Top Bar: Actions (Undo, Redo, Reset, Delete, Copy, Save) - Only when image is loaded */}
      {currentCanvas && (
        <div className="flex items-center justify-end gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
        </div>
      )}

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
                편집할 이미지를 끌어다 놓으세요
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                클릭하여 파일 찾기 또는 <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-indigo-300">Ctrl+V</kbd> 로 붙여넣기
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Workspace Layout: Full Canvas Viewport (Behind) + Floating Left Palette + Floating Right Options */
        <div className="relative w-full h-[calc(100vh-125px)] min-h-[420px] rounded-2xl bg-slate-950/85 border border-slate-800 shadow-2xl overflow-hidden select-none">
          {/* ========================================================================= */}
          {/* 1. FULL CANVAS VIEWPORT: Edge-to-Edge Canvas Area Behind Floating Panels  */}
          {/* ========================================================================= */}
          <div
            ref={viewportContainerRef}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleLoadFile(e.dataTransfer.files[0]);
              }
            }}
            onPointerDown={(e) => {
              handleViewportPointerDown(e);
              handleViewportBgPointerDown(e);
            }}
            onPointerMove={(e) => {
              handleViewportPointerMove(e);
              handleViewportBgPointerMove(e);
              handleGuideLinePointerMove(e);
            }}
            onPointerUp={(e) => {
              handleViewportPointerUp(e);
              handleViewportBgPointerUp(e);
              handleGuideLinePointerUp(e);
            }}
            onWheel={handleWheelZoom}
            className={`absolute inset-0 flex items-center justify-center overflow-hidden p-2 sm:p-4 select-none touch-none ${
              activeTool === 'mosaic' ||
              (activeTool === 'sharpen' && activeMosaicMode !== null)
                ? 'cursor-crosshair'
                : 'cursor-grab active:cursor-grabbing'
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
              className={`relative inline-block will-change-transform select-none shrink-0 ${
                activeTool === 'transform' && transformQuad === null
                  ? 'cursor-crosshair'
                  : ''
              }`}
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) rotate(${fineAngle + animTransform.rotate}deg) scale(${animTransform.scaleX}, ${animTransform.scaleY})`,
                width: `${Math.round((currentCanvas?.width || 1) * zoomLevel)}px`,
                height: `${Math.round((currentCanvas?.height || 1) * zoomLevel)}px`,
                transition: animTransform.isTransitioning
                  ? 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                  : 'none',
                transformOrigin: 'center center'
              }}
            >
              <canvas
                ref={displayCanvasRef}
                style={{
                  width: `${Math.round((currentCanvas?.width || 1) * zoomLevel)}px`,
                  height: `${Math.round((currentCanvas?.height || 1) * zoomLevel)}px`
                }}
                className="block object-contain rounded shadow"
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
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded bg-slate-950/95 text-xs font-mono font-semibold text-indigo-300 border border-indigo-500/40 whitespace-nowrap shadow pointer-events-none">
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

              {/* Transform Initial Selection Rectangle Overlay */}
              {activeTool === 'transform' && transformQuad === null && transformSelectionRect && transformSelectionRect.width > 2 && transformSelectionRect.height > 2 && currentCanvas && (
                <div
                  className="absolute border-2 border-indigo-400 bg-indigo-500/20 pointer-events-none shadow-[0_0_14px_rgba(99,102,241,0.4)]"
                  style={{
                    left: `${(transformSelectionRect.x / currentCanvas.width) * 100}%`,
                    top: `${(transformSelectionRect.y / currentCanvas.height) * 100}%`,
                    width: `${(transformSelectionRect.width / currentCanvas.width) * 100}%`,
                    height: `${(transformSelectionRect.height / currentCanvas.height) * 100}%`,
                  }}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded bg-slate-950/95 text-[11px] font-mono text-indigo-300 border border-indigo-500/50 whitespace-nowrap shadow pointer-events-none">
                    선택 영역: {transformSelectionRect.width} × {transformSelectionRect.height} px
                  </div>
                </div>
              )}

              {/* Transform Active Warp Overlay (왜곡 / 원근 / 원근 자르기 핸들 및 격자선) */}
              {activeTool === 'transform' && transformQuad && currentCanvas && (
                <>
                  {/* SVG Polygon & 3x3 Grid */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                    <defs>
                      <filter id="transformGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#818cf8" floodOpacity="0.6" />
                      </filter>
                    </defs>
                    {/* Bounding Polygon */}
                    <polygon
                      points={`${transformQuad.tl.x * zoomLevel},${transformQuad.tl.y * zoomLevel} ${transformQuad.tr.x * zoomLevel},${transformQuad.tr.y * zoomLevel} ${transformQuad.br.x * zoomLevel},${transformQuad.br.y * zoomLevel} ${transformQuad.bl.x * zoomLevel},${transformQuad.bl.y * zoomLevel}`}
                      fill={transformMode === 'crop' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(168, 85, 247, 0.12)'}
                      stroke={transformMode === 'crop' ? '#38bdf8' : '#a855f7'}
                      strokeWidth="2"
                      strokeDasharray="6,4"
                      filter="url(#transformGlow)"
                    />
                    {/* 3x3 Perspective Grid Lines */}
                    {(() => {
                      const tlX = transformQuad.tl.x * zoomLevel;
                      const tlY = transformQuad.tl.y * zoomLevel;
                      const trX = transformQuad.tr.x * zoomLevel;
                      const trY = transformQuad.tr.y * zoomLevel;
                      const brX = transformQuad.br.x * zoomLevel;
                      const brY = transformQuad.br.y * zoomLevel;
                      const blX = transformQuad.bl.x * zoomLevel;
                      const blY = transformQuad.bl.y * zoomLevel;

                      const t1X = tlX + (trX - tlX) / 3;
                      const t1Y = tlY + (trY - tlY) / 3;
                      const b1X = blX + (brX - blX) / 3;
                      const b1Y = blY + (brY - blY) / 3;

                      const t2X = tlX + ((trX - tlX) * 2) / 3;
                      const t2Y = tlY + ((trY - tlY) * 2) / 3;
                      const b2X = blX + ((brX - blX) * 2) / 3;
                      const b2Y = blY + ((brY - blY) * 2) / 3;

                      const l1X = tlX + (blX - tlX) / 3;
                      const l1Y = tlY + (blY - tlY) / 3;
                      const r1X = trX + (brX - trX) / 3;
                      const r1Y = trY + (brY - trY) / 3;

                      const l2X = tlX + ((blX - tlX) * 2) / 3;
                      const l2Y = tlY + ((blY - tlY) * 2) / 3;
                      const r2X = trX + ((brX - trX) * 2) / 3;
                      const r2Y = trY + ((brY - trY) * 2) / 3;

                      return (
                        <g stroke="rgba(255, 255, 255, 0.35)" strokeWidth="1" strokeDasharray="3,3">
                          <line x1={t1X} y1={t1Y} x2={b1X} y2={b1Y} />
                          <line x1={t2X} y1={t2Y} x2={b2X} y2={b2Y} />
                          <line x1={l1X} y1={l1Y} x2={r1X} y2={r1Y} />
                          <line x1={l2X} y1={l2Y} x2={r2X} y2={r2Y} />
                        </g>
                      );
                    })()}
                  </svg>

                  {/* 4 Corner Control Handles */}
                  {(['tl', 'tr', 'br', 'bl'] as const).map((pos) => {
                    const pt = transformQuad[pos];
                    const px = pt.x * zoomLevel;
                    const py = pt.y * zoomLevel;
                    const label = pos === 'tl' ? '좌상' : pos === 'tr' ? '우상' : pos === 'br' ? '우하' : '좌하';
                    return (
                      <div
                        key={pos}
                        onPointerDown={(e) => handleTransformHandlePointerDown(e, pos)}
                        onPointerMove={handleTransformHandlePointerMove}
                        onPointerUp={handleTransformHandlePointerUp}
                        style={{
                          left: `${px}px`,
                          top: `${py}px`
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.6)] flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-125 transition-transform z-40 group"
                        title={`${label} 조절점 (드래그하여 이동 / Ctrl+드래그로 독립 왜곡)`}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 pointer-events-none" />
                        <div className="absolute -top-6 px-1.5 py-0.5 rounded bg-slate-900/90 text-[10px] text-indigo-300 font-mono border border-indigo-500/40 pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                          {label} ({Math.round(pt.x)}, {Math.round(pt.y)})
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Object-based Multi-Text Items Layer */}
              {textItems.map((item) => {
                const isSelected = selectedTextId === item.id;
                const leftPx = item.x * zoomLevel;
                const topPx = item.y * zoomLevel;
                const scaledFontSize = Math.max(8, item.fontSize * zoomLevel);
                const scaledBorderWidth = item.borderWidth > 0 ? Math.max(1, Math.round(item.borderWidth * zoomLevel)) : 0;
                const scaledRadius = Math.round(item.backgroundRadius * zoomLevel);
                const hasDecor = item.hasBackground || item.borderWidth > 0;
                const scaledPadX = hasDecor ? Math.max(4, Math.round(8 * zoomLevel)) : 0;
                const scaledPadY = hasDecor ? Math.max(2, Math.round(4 * zoomLevel)) : 0;

                const hasUserBorder = item.borderWidth > 0;
                let outlineStyle: string | undefined = undefined;
                let ringClass = '';

                if (!hasUserBorder) {
                  outlineStyle = isSelected
                    ? '1.5px solid #94a3b8'
                    : '1px dashed rgba(148, 163, 184, 0.25)';
                } else {
                  ringClass = isSelected ? 'ring-1 ring-indigo-400/80 shadow-md' : 'hover:ring-1 hover:ring-indigo-400/30';
                }

                return (
                  <div
                    key={item.id}
                    onPointerDown={(e) => handleTextOverlayPointerDown(e, item.id)}
                    onPointerMove={handleTextOverlayPointerMove}
                    onPointerUp={handleTextOverlayPointerUp}
                    onDoubleClick={() => {
                      handleSelectTextItem(item.id);
                      if (activeTool !== 'text') setActiveTool('text');
                    }}
                    className={`absolute z-20 cursor-move select-none transition-shadow ${ringClass}`}
                    style={{
                      left: `${leftPx}px`,
                      top: `${topPx}px`,
                      backgroundColor: item.hasBackground ? item.backgroundColor : 'transparent',
                      borderRadius: hasDecor ? `${scaledRadius}px` : '0px',
                      borderWidth: hasUserBorder ? `${scaledBorderWidth}px` : undefined,
                      borderColor: hasUserBorder ? item.borderColor : undefined,
                      borderStyle: hasUserBorder ? item.borderStyle : undefined,
                      outline: outlineStyle,
                      padding: hasDecor ? `${scaledPadY}px ${scaledPadX}px` : '0px',
                      opacity: item.opacity
                    }}
                    title={isSelected ? "드래그하여 이동, 더블클릭하여 내용 수정" : "클릭하여 선택"}
                  >
                    {/* On-canvas direct delete button: 선택된 객체에만 노출 */}
                    {isSelected && (
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteTextItem(item.id);
                        }}
                        className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg flex items-center justify-center cursor-pointer z-30 transition-transform hover:scale-110 border border-white/50"
                        title="텍스트 삭제 (Del/Backspace)"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    <div
                      style={{
                        fontFamily: item.fontFamily,
                        fontSize: `${scaledFontSize}px`,
                        color: item.color,
                        fontWeight: 'bold',
                        lineHeight: 1.2
                      }}
                      className="whitespace-nowrap"
                    >
                      {item.text || '(텍스트)'}
                    </div>
                  </div>
                );
              })}

              {/* Guidelines Overlay anchored directly to Image (Grid + Draggable Horizontal & Vertical Baselines) */}
              {(activeTool === 'rotate' || activeTool === 'transform') && (
                <div className="absolute inset-0 pointer-events-none select-none z-20">
                  {/* Subtle Grid Lines on image */}
                  {showGridLines && (
                    <div
                      className="absolute inset-0 pointer-events-none opacity-25"
                      style={{
                        backgroundImage: `linear-gradient(to right, rgba(99, 102, 241, 0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(99, 102, 241, 0.6) 1px, transparent 1px)`,
                        backgroundSize: '40px 40px'
                      }}
                    />
                  )}

                  {/* Draggable Horizontal & Vertical Reference Baselines anchored to image */}
                  {showGuidelines && (
                    <>
                      {/* Horizontal Baseline (Fixed position relative to image, level reference) */}
                      <div
                        style={{
                          top: `${guideLineYPct}%`,
                          left: '-100vw',
                          right: '-100vw',
                          transform: activeTool === 'rotate' ? `rotate(${-fineAngle}deg)` : undefined,
                          transformOrigin: `${guideLineXPct}% center`
                        }}
                        className="absolute -translate-y-1/2 pointer-events-auto cursor-ns-resize group z-30 py-2.5"
                        onPointerDown={handleGuideLineHPointerDown}
                        title="가로 기준선 (이미지 기준 동일 위치 고정, 드래그하여 이동)"
                      >
                        <div className="w-full h-[1px] bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]" />
                      </div>

                      {/* Vertical Baseline (Fixed position relative to image, plumb reference) */}
                      <div
                        style={{
                          left: `${guideLineXPct}%`,
                          top: '-100vh',
                          bottom: '-100vh',
                          transform: activeTool === 'rotate' ? `rotate(${-fineAngle}deg)` : undefined,
                          transformOrigin: `center ${guideLineYPct}%`
                        }}
                        className="absolute -translate-x-1/2 pointer-events-auto cursor-ew-resize group z-30 px-2.5"
                        onPointerDown={handleGuideLineVPointerDown}
                        title="세로 기준선 (이미지 기준 동일 위치 고정, 드래그하여 이동)"
                      >
                        <div className="h-full w-[1px] bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.6)]" />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* ========================================================================= */}
          {/* 2. FLOATING LEFT PALETTE & ZOOM CARD (Overlaid on canvas)                 */}
          {/* ========================================================================= */}
          <div className="absolute left-3 top-3 bottom-3 z-30 pointer-events-none flex flex-col justify-start gap-2">
            <div className="pointer-events-auto">
              {isPaletteCollapsed ? (
                <div className="w-12 shrink-0 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1.5 max-h-[calc(100vh-230px)] overflow-y-auto">
                  <button
                    onClick={() => setIsPaletteCollapsed(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer mb-1 border-b border-slate-800 w-full flex justify-center"
                    title="도구 팔레트 펼치기"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {PALETTE_TOOLS.map((tool) => {
                    const IconComponent = tool.icon;
                    const isSelected = activeTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        onClick={() => handleSelectTool(tool.id as ActiveTool)}
                        className={`p-2 rounded-xl transition cursor-pointer relative group flex justify-center ${
                          isSelected
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                        title={tool.label}
                      >
                        <IconComponent className="w-4 h-4 shrink-0" />
                        <span className="absolute left-full ml-2 px-2 py-1 rounded bg-slate-900 text-white text-[10px] whitespace-nowrap shadow-xl border border-slate-700 hidden group-hover:block z-50 pointer-events-none">
                          {tool.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="w-48 shrink-0 p-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md space-y-2 max-h-[calc(100vh-230px)] overflow-y-auto">
                  <div className="text-xs font-bold text-slate-300 px-2 py-1 border-b border-slate-800/80 flex items-center justify-between">
                    <span>도구 팔레트</span>
                    <button
                      onClick={() => setIsPaletteCollapsed(true)}
                      className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                      title="도구 팔레트 접기"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
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
                          <span className="text-sm font-semibold leading-tight truncate">{tool.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                    <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] font-mono space-y-0.5">
                      <div className="text-xs text-slate-300 font-medium">캔버스 해상도</div>
                      <div className="text-sm font-bold text-white tracking-tight">
                        {currentCanvas.width} × {currentCanvas.height} px
                      </div>
                    </div>

                    <div className="text-xs text-center text-slate-300 px-2 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800/60 leading-tight">
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[11px] border border-slate-700">Ctrl+V</kbd> 새 이미지 교체
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Image Zoom / Fit to Screen Card below tool palette */}
            <div className="pointer-events-auto">
              {isPaletteCollapsed ? (
                <div className="w-12 shrink-0 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1 select-none">
                  <button
                    onClick={() => setZoomLevel((prev) => Math.min(5.0, Number((prev + 0.1).toFixed(2))))}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                    title="확대 (Zoom In)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleResetTo100}
                    className="py-0.5 text-[10px] font-mono font-bold text-indigo-300 hover:bg-slate-800 rounded w-full text-center transition cursor-pointer"
                    title="100% 원본 픽셀 크기 (1:1 픽셀 매칭)"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                  <button
                    onClick={() => setZoomLevel((prev) => Math.max(0.1, Number((prev - 0.1).toFixed(2))))}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                    title="축소 (Zoom Out)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-6 h-px bg-slate-800 my-0.5" />
                  <button
                    onClick={handleFitToScreen}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                    title="화면 맞춤 (가용 화면에 꽉 채우기)"
                  >
                    <Maximize className="w-3.5 h-3.5 text-indigo-400" />
                  </button>
                </div>
              ) : (
                <div className="w-48 shrink-0 p-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md space-y-1.5 select-none">
                  <div className="flex items-center justify-between bg-slate-950/70 p-1 rounded-xl border border-slate-800/80">
                    <button
                      onClick={() => setZoomLevel((prev) => Math.max(0.1, Number((prev - 0.1).toFixed(2))))}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                      title="축소 (Zoom Out)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleResetTo100}
                      className="px-2 py-0.5 rounded font-mono font-bold text-xs text-indigo-300 hover:bg-slate-800 transition cursor-pointer"
                      title="100% 원본 픽셀 크기 (1:1 픽셀 매칭)"
                    >
                      {Math.round(zoomLevel * 100)}%
                    </button>
                    <button
                      onClick={() => setZoomLevel((prev) => Math.min(5.0, Number((prev + 0.1).toFixed(2))))}
                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                      title="확대 (Zoom In)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={handleFitToScreen}
                    className="w-full py-1.5 px-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                    title="화면 맞춤 (가용 화면에 꽉 채우기)"
                  >
                    <Maximize className="w-3.5 h-3.5 text-indigo-400" />
                    <span>화면 맞춤</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. FLOATING RIGHT OPTIONS PANEL (Overlaid on canvas)                      */}
          {/* ========================================================================= */}
          <div className="absolute right-3 top-3 bottom-3 z-30 pointer-events-none flex flex-col justify-start">
            <div className="pointer-events-auto">
              {isRightPanelCollapsed ? (
                <div className="w-10 shrink-0 flex flex-col items-center py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md max-h-[calc(100vh-145px)] gap-3">
                  <button
                    onClick={() => setIsRightPanelCollapsed(false)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                    title="옵션 패널 펼치기"
                  >
                    <ChevronLeft className="w-4 h-4 text-indigo-400" />
                  </button>
                  <button
                    onClick={handleApplyCurrentTool}
                    className="p-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 transition cursor-pointer"
                    title="변경 적용"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <div className="[writing-mode:vertical-rl] text-[10px] font-semibold text-slate-500 tracking-wider py-2 select-none">
                    설정 패널
                  </div>
                </div>
              ) : (
                <div className="w-72 sm:w-80 shrink-0 space-y-3">
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md space-y-3 max-h-[calc(100vh-145px)] overflow-y-auto pb-8">
                    {/* Header: '변경 적용' on Left + Minimize Button on Right (No Title!) */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <button
                        onClick={handleApplyCurrentTool}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>변경 적용</span>
                      </button>
                      <button
                        onClick={() => setIsRightPanelCollapsed(true)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                        title="옵션 패널 접기"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

              {/* ---------------- Tool 1: 자르기 ---------------- */}
              {activeTool === 'crop' && (
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm text-slate-300 font-medium">
                      <span>Auto Crop 여백 감도</span>
                      <span className="font-mono text-indigo-300 font-bold text-sm">{cropTolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="60"
                      value={cropTolerance}
                      onChange={(e) => handleCropToleranceChange(parseInt(e.target.value, 10))}
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

                  </div>
              )}

              {/* ---------------- Tool: 자유 변형 (Free Transform) ---------------- */}
              {activeTool === 'transform' && (
                <div className="space-y-3.5 text-xs">
                  {/* 1. Mode Selector Tabs (2x2 Grid) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-slate-400">1단계: 변형 방식 선택</span>
                      {transformQuad !== null && (
                        <button
                          onClick={handleResetTransformSelection}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                        >
                          영역 다시 지정
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/70 border border-slate-800 rounded-xl">
                      <button
                        onClick={() => handleChooseTransformMode('crop')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition text-center cursor-pointer ${
                          transformMode === 'crop'
                            ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        원근 자르기
                      </button>
                      <button
                        onClick={() => handleChooseTransformMode('distort')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition text-center cursor-pointer ${
                          transformMode === 'distort'
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        자유 왜곡
                      </button>
                      <button
                        onClick={() => handleChooseTransformMode('perspective')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition text-center cursor-pointer ${
                          transformMode === 'perspective'
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        원근감
                      </button>
                      <button
                        onClick={() => handleChooseTransformMode('skew')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-semibold transition text-center cursor-pointer ${
                          transformMode === 'skew'
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        기울이기
                      </button>
                    </div>
                  </div>

                  {/* 2. Selection Prompt when Area is NOT yet designated (transformQuad === null) */}
                  {transformQuad === null && (
                    <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-slate-300 space-y-2.5 leading-relaxed">
                      <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                        <Scan className="w-4 h-4 text-indigo-400" />
                        <span>2단계: 대상 영역 지정</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {transformMode
                          ? '캔버스에서 변형할 영역을 마우스로 드래그하세요. 드래그가 끝나면 즉시 조절점이 생성됩니다.'
                          : '위 4가지 변형 방식 중 하나를 선택한 후, 캔버스에서 변형할 영역을 드래그하세요.'}
                      </p>

                      <button
                        onClick={handleSelectEntireCanvasForTransform}
                        className="w-full py-2 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 hover:text-white text-xs transition cursor-pointer text-center font-medium"
                      >
                        이미지 전체 영역 선택
                      </button>
                    </div>
                  )}

                  {/* 3. Mode-specific controls when Area IS designated (transformQuad !== null) */}
                  {transformQuad !== null && (
                    <>
                      {transformMode === 'crop' && (
                        <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-500/20 text-slate-300 space-y-1.5 leading-relaxed">
                          <div className="font-semibold text-sky-400 flex items-center gap-1">
                            <span>📐 원근 자르기 (Perspective Crop)</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            문서 스캔본, 비스듬히 찍힌 간판이나 액자의 4개 모서리에 조절점을 맞춘 후 적용을 누르면 정면의 네모 반듯한 평면으로 펴면서 동시에 크롭합니다.
                          </p>
                        </div>
                      )}

                      {transformMode === 'distort' && (
                        <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/20 text-slate-300 space-y-1.5 leading-relaxed">
                          <div className="font-semibold text-purple-300 flex items-center gap-1">
                            <span>✨ 자유 왜곡 (Distort)</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            네 모서리의 조절점을 각각 독립적으로 자유롭게 끌어당겨 비대칭으로 틀어진 평면을 맞춥니다.
                          </p>
                          <div className="text-[10px] text-indigo-300 font-mono bg-slate-900/80 px-2 py-1 rounded border border-indigo-500/30">
                            💡 팁: 어떤 모드에서든 모서리 드래그 중 Ctrl 키를 누르면 일시적으로 Distort 모드로 동작합니다.
                          </div>
                        </div>
                      )}

                      {transformMode === 'perspective' && (
                        <div className="p-2.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-slate-300 space-y-1.5 leading-relaxed">
                          <div className="font-semibold text-indigo-300 flex items-center gap-1">
                            <span>🔍 원근감 (Perspective)</span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            한쪽 모서리를 잡고 당기면 반대편 대칭 모서리가 함께 움직여 사다리꼴 형태(원근감)로 폭이나 높이를 벌리거나 좁힙니다.
                          </p>
                          <div className="text-[10px] text-indigo-300 font-mono bg-slate-900/80 px-2 py-1 rounded border border-indigo-500/30">
                            💡 팁: Ctrl 키를 누른 채 드래그하면 대칭 연동 없이 해당 모서리만 단독 이동합니다.
                          </div>
                        </div>
                      )}

                      {transformMode === 'skew' && (
                        <div className="space-y-3">
                          <div className="p-2.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-slate-300 space-y-1 leading-relaxed">
                            <div className="font-semibold text-indigo-300">
                              <span>📐 기울이기 (Skew)</span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              평행사변형 형태로 각도를 비스듬히 눕히거나 세웁니다.
                            </p>
                          </div>

                          {/* Skew X Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-300 font-medium">
                              <span>수평 기울이기 (X축)</span>
                              <span className="font-mono text-indigo-300 font-bold">{transformSkewX}°</span>
                            </div>
                            <input
                              type="range"
                              min="-45"
                              max="45"
                              step="1"
                              value={transformSkewX}
                              onChange={(e) => setTransformSkewX(parseInt(e.target.value, 10))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                          </div>

                          {/* Skew Y Slider */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-300 font-medium">
                              <span>수직 기울이기 (Y축)</span>
                              <span className="font-mono text-indigo-300 font-bold">{transformSkewY}°</span>
                            </div>
                            <input
                              type="range"
                              min="-45"
                              max="45"
                              step="1"
                              value={transformSkewY}
                              onChange={(e) => setTransformSkewY(parseInt(e.target.value, 10))}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* Background Mode Selector */}
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-semibold text-slate-400">여백 배경색</span>
                        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/70 border border-slate-800 rounded-xl">
                          {(['transparent', 'white', 'black'] as const).map((bg) => (
                            <button
                              key={bg}
                              onClick={() => setTransformBgMode(bg)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer text-center ${
                                transformBgMode === bg
                                  ? 'bg-slate-700 text-white font-bold border border-slate-600'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {bg === 'transparent' ? '투명' : bg === 'white' ? '흰색' : '검정'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Auto-fit toggle for distort/perspective */}
                      {(transformMode === 'distort' || transformMode === 'perspective') && (
                        <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80 cursor-pointer hover:bg-slate-900 transition">
                          <input
                            type="checkbox"
                            checked={transformAutoFit}
                            onChange={(e) => setTransformAutoFit(e.target.checked)}
                            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-slate-300 text-xs">변형 영역에 맞춰 캔버스 자동 확장</span>
                        </label>
                      )}

                      {/* Action Buttons */}
                      <div className="pt-2 flex flex-col gap-2">
                        <button
                          onClick={handleApplyTransform}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer active:scale-98"
                        >
                          <Check className="w-4 h-4" />
                          <span>{transformMode === 'crop' ? '원근 자르기 적용' : '변형 적용'}</span>
                        </button>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            onClick={handleResetTransform}
                            className="py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition cursor-pointer text-center"
                          >
                            모서리 초기화
                          </button>
                          <button
                            onClick={handleResetTransformSelection}
                            className="py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition cursor-pointer text-center"
                          >
                            영역 다시 지정
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* 4. 기준선 & 격자망 설정 (자유 변형 중 상시 사용 가능) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 mt-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showGuidelines}
                          onChange={(e) => setShowGuidelines(e.target.checked)}
                          className="accent-amber-500 rounded"
                        />
                        <span>기준선 (가로·세로)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showGridLines}
                          onChange={(e) => setShowGridLines(e.target.checked)}
                          className="accent-indigo-500 rounded"
                        />
                        <span>격자망</span>
                      </label>
                    </div>

                    {showGuidelines && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                        <span>기준선 중앙 정렬:</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setGuideLineYPct(50)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold cursor-pointer"
                          >
                            가로선
                          </button>
                          <button
                            onClick={() => setGuideLineXPct(50)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold cursor-pointer"
                          >
                            세로선
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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
                    <span>비율 고정</span>
                  </label>

                  <div className="grid grid-cols-4 gap-1 pt-1">
                    {[
                      { label: '20%', factor: 0.20 },
                      { label: '40%', factor: 0.40 },
                      { label: '60%', factor: 0.60 },
                      { label: '80%', factor: 0.80 },
                      { label: '125%', factor: 1.25 },
                      { label: '150%', factor: 1.50 },
                      { label: '175%', factor: 1.75 },
                      { label: '200%', factor: 2.00 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          if (!currentCanvas) return;
                          const baseW = originalCanvas?.width || currentCanvas.width;
                          const baseH = originalCanvas?.height || currentCanvas.height;
                          setTargetWidth(Math.round(baseW * p.factor));
                          setTargetHeight(Math.round(baseH * p.factor));
                        }}
                        className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold border border-slate-700 transition cursor-pointer"
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
                          const arrow = renderAnchorArrow(r, c);
                          return (
                            <button
                              key={`${r}-${c}`}
                              type="button"
                              onClick={() => setCanvasAnchor({ row: r, col: c })}
                              className={`w-12 h-12 rounded-lg flex items-center justify-center transition cursor-pointer ${
                                isAnchor
                                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-extrabold shadow-md shadow-indigo-600/40 border-2 border-indigo-300'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800'
                              }`}
                              title={isAnchor ? '현재 고정 앵커 위치' : '이 위치를 고정 앵커로 설정'}
                            >
                              {isAnchor ? (
                                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
                              ) : (
                                arrow
                              )}
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
                        { id: '#ffffff', label: '흰색' },
                        { id: '#000000', label: '검정' },
                        { id: 'transparent', label: '투명' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCanvasBgColor(c.id)}
                          className={`py-1 px-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                            canvasBgColor === c.id
                              ? 'border-indigo-400 bg-indigo-600/30 text-white shadow-sm font-bold'
                              : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'
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

              {/* ---------------- Tool 4: 회전 / 반전 (버튼 우선 배치, 각도 조절, 기준선/격자망) ---------------- */}
              {activeTool === 'rotate' && (
                <div className="space-y-3 text-xs">
                  {/* 1. 90-degree Rotation & Flipping Buttons (1列 세로 배열 우선 배치) */}
                  <div className="space-y-1.5">
                    <button
                      onClick={() => handleApplyRotateWithAnim(90)}
                      disabled={animTransform.isTransitioning}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-2.5 cursor-pointer transition disabled:opacity-50"
                    >
                      <RotateCw className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>우로 90° 회전</span>
                    </button>

                    <button
                      onClick={() => handleApplyRotateWithAnim(270)}
                      disabled={animTransform.isTransitioning}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-2.5 cursor-pointer transition disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>좌로 90° 회전</span>
                    </button>

                    <button
                      onClick={() => handleApplyFlipWithAnim(true, false)}
                      disabled={animTransform.isTransitioning}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-2.5 cursor-pointer transition disabled:opacity-50"
                    >
                      <FlipHorizontal className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>좌우 반전</span>
                    </button>

                    <button
                      onClick={() => handleApplyFlipWithAnim(false, true)}
                      disabled={animTransform.isTransitioning}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 flex items-center gap-2.5 cursor-pointer transition disabled:opacity-50"
                    >
                      <FlipVertical className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>상하 반전</span>
                    </button>
                  </div>

                  {/* 2. 각도 조절 (0.1도 단위 슬라이더 & 미세 조정 버튼 & 직접 입력) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300">각도 조절</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="-180"
                          max="180"
                          step="0.1"
                          value={fineAngle}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setFineAngle(isNaN(val) ? 0 : Number(Math.max(-180, Math.min(180, val)).toFixed(1)));
                          }}
                          className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-indigo-300 font-mono font-bold text-xs focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-slate-400 font-bold text-xs">°</span>
                      </div>
                    </div>

                    {/* Slider (-45.0° ~ +45.0°, step 0.1) */}
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      step="0.1"
                      value={fineAngle}
                      onChange={(e) => setFineAngle(Number(parseFloat(e.target.value).toFixed(1)))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />

                    {/* Stepper Buttons: 0.1도 및 1도 단위 미세 제어 */}
                    <div className="grid grid-cols-7 gap-1">
                      <button
                        onClick={() => setFineAngle((prev) => Number(Math.max(-180, prev - 5).toFixed(1)))}
                        className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                        title="5도 반시계 회전"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => setFineAngle((prev) => Number(Math.max(-180, prev - 1).toFixed(1)))}
                        className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                        title="1도 반시계 회전"
                      >
                        -1°
                      </button>
                      <button
                        onClick={() => setFineAngle((prev) => Number(Math.max(-180, prev - 0.1).toFixed(1)))}
                        className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                        title="0.1도 미세 반시계 회전"
                      >
                        -0.1°
                      </button>
                      <button
                        onClick={() => setFineAngle(0)}
                        className={`py-1 rounded text-[10px] font-semibold transition cursor-pointer ${
                          fineAngle !== 0
                            ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/50'
                            : 'bg-slate-800/60 text-slate-500'
                        }`}
                        title="0도로 원위치"
                      >
                        0°
                      </button>
                      <button
                        onClick={() => setFineAngle((prev) => Number(Math.min(180, prev + 0.1).toFixed(1)))}
                        className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                        title="0.1도 미세 시계 회전"
                      >
                        +0.1°
                      </button>
                      <button
                        onClick={() => setFineAngle((prev) => Number(Math.min(180, prev + 1).toFixed(1)))}
                        className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                        title="1도 시계 회전"
                      >
                        +1°
                      </button>
                      <button
                        onClick={() => setFineAngle((prev) => Number(Math.min(180, prev + 5).toFixed(1)))}
                        className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                        title="5도 시계 회전"
                      >
                        +5°
                      </button>
                    </div>

                    {/* Direct Apply Button if fineAngle !== 0 */}
                    {fineAngle !== 0 && (
                      <button
                        onClick={handleApplyFineRotate}
                        className="w-full py-1.5 px-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>회전 각도 적용 ({fineAngle > 0 ? '+' : ''}{fineAngle.toFixed(1)}°)</span>
                      </button>
                    )}
                  </div>

                  {/* 3. 기준선 & 격자망 설정 (개별 동작) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showGuidelines}
                          onChange={(e) => setShowGuidelines(e.target.checked)}
                          className="accent-amber-500 rounded"
                        />
                        <span>기준선</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showGridLines}
                          onChange={(e) => setShowGridLines(e.target.checked)}
                          className="accent-indigo-500 rounded"
                        />
                        <span>격자망</span>
                      </label>
                    </div>

                    {showGuidelines && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                        <span>기준선 중앙 정렬:</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setGuideLineYPct(50)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold"
                          >
                            가로선
                          </button>
                          <button
                            onClick={() => setGuideLineXPct(50)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold"
                          >
                            세로선
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ---------------- Tool: 배경색 조정 (흰색 배경 투명화 및 배경색 교체) ---------------- */}
              {activeTool === 'bgcolor' && (
                <div className="space-y-3 text-xs">
                  {/* 1. Quick Presets */}
                  <div className="space-y-1.5">
                    <span className="text-slate-400 text-[10px] font-semibold">원클릭 프리셋 (클릭하여 선택)</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBgPreset('white');
                          setBgColorTarget('#ffffff');
                          setBgColorTolerance(18);
                          setBgColorSmoothness(6);
                          setBgColorContiguous(true);
                          setBgColorReplaceMode('transparent');
                          setIsBgColorModified(true);
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] transition text-left cursor-pointer truncate flex items-center gap-1.5 ${
                          selectedBgPreset === 'white'
                            ? 'bg-indigo-600/30 text-white border-indigo-400 font-bold shadow-sm shadow-indigo-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700 font-medium'
                        }`}
                        title="외곽 흰색 배경을 깨끗하게 투명화 (내부 보존)"
                      >
                        <Eraser className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>흰색 배경 투명화</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBgPreset('black');
                          setBgColorTarget('#000000');
                          setBgColorTolerance(18);
                          setBgColorSmoothness(6);
                          setBgColorContiguous(true);
                          setBgColorReplaceMode('transparent');
                          setIsBgColorModified(true);
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] transition text-left cursor-pointer truncate flex items-center gap-1.5 ${
                          selectedBgPreset === 'black'
                            ? 'bg-indigo-600/30 text-white border-indigo-400 font-bold shadow-sm shadow-indigo-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700 font-medium'
                        }`}
                        title="외곽 검은색 배경을 투명화"
                      >
                        <span className="w-3 h-3 rounded-full bg-black border border-slate-600 shrink-0" />
                        <span>검은색 배경 투명화</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBgPreset('all-white');
                          setBgColorTarget('#ffffff');
                          setBgColorTolerance(25);
                          setBgColorSmoothness(6);
                          setBgColorContiguous(false);
                          setBgColorReplaceMode('transparent');
                          setIsBgColorModified(true);
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] transition text-left cursor-pointer truncate ${
                          selectedBgPreset === 'all-white'
                            ? 'bg-indigo-600/30 text-white border-indigo-400 font-bold shadow-sm shadow-indigo-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700 font-medium'
                        }`}
                        title="이미지 내 모든 흰색을 투명화"
                      >
                        밝은 배경 전체 제거
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBgPreset('chroma');
                          setBgColorTarget('#00ff00');
                          setBgColorTolerance(35);
                          setBgColorSmoothness(8);
                          setBgColorContiguous(true);
                          setBgColorReplaceMode('transparent');
                          setIsBgColorModified(true);
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] transition text-left cursor-pointer truncate ${
                          selectedBgPreset === 'chroma'
                            ? 'bg-indigo-600/30 text-emerald-300 border-indigo-400 font-bold shadow-sm shadow-indigo-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 border-slate-700 font-medium'
                        }`}
                        title="녹색 크로마키 배경 투명화"
                      >
                        크로마키 (녹색)
                      </button>
                    </div>
                  </div>

                  {/* 2. 처리 방식 선택 (투명화 vs 다른 색 교체) */}
                  <div className="space-y-1.5">
                    <span className="text-slate-400 text-[10px] font-semibold">동작 모드</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBgColorReplaceMode('transparent');
                          setIsBgColorModified(true);
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 ${
                          isBgColorModified && bgColorReplaceMode === 'transparent'
                            ? 'border-indigo-400 bg-indigo-600/30 text-white shadow'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        <span>투명 배경 (PNG)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBgColorReplaceMode('replace');
                          setIsBgColorModified(true);
                        }}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-1.5 ${
                          isBgColorModified && bgColorReplaceMode === 'replace'
                            ? 'border-indigo-400 bg-indigo-600/30 text-white shadow'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>배경색 변경</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. 제거할 대상 색상 (Target Color) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-300">제거할 대상 색상</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => pickColorFromEyeDropper((hex) => {
                            setBgColorTarget(hex);
                            setSelectedBgPreset(null);
                            setIsBgColorModified(true);
                          })}
                          title="화면에서 색상 추출 (스포이트)"
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                        >
                          <Pipette className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="color"
                          value={bgColorTarget}
                          onChange={(e) => {
                            setBgColorTarget(e.target.value);
                            setSelectedBgPreset(null);
                            setIsBgColorModified(true);
                          }}
                          className="w-6 h-6 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={bgColorTarget}
                          onChange={(e) => {
                            setBgColorTarget(e.target.value);
                            setSelectedBgPreset(null);
                            setIsBgColorModified(true);
                          }}
                          className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Quick color chips */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500">빠른 선택:</span>
                      {[
                        { color: '#ffffff', label: '흰색' },
                        { color: '#000000', label: '검정' },
                        { color: '#f8fafc', label: '아이보리' },
                        { color: '#e2e8f0', label: '연회색' },
                        { color: '#00ff00', label: '크로마키' }
                      ].map((chip) => (
                        <button
                          key={chip.color}
                          type="button"
                          onClick={() => {
                            setBgColorTarget(chip.color);
                            setSelectedBgPreset(null);
                            setIsBgColorModified(true);
                          }}
                          className={`w-5 h-5 rounded-md border transition cursor-pointer ${
                            isBgColorModified && bgColorTarget.toLowerCase() === chip.color.toLowerCase()
                              ? 'border-indigo-400 scale-110 shadow-sm shadow-indigo-500'
                              : 'border-slate-700 hover:border-slate-500'
                          }`}
                          style={{ backgroundColor: chip.color }}
                          title={chip.label}
                        />
                      ))}
                    </div>

                    {/* If replace mode, show new color picker */}
                    {bgColorReplaceMode === 'replace' && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-300 font-medium">새로 채울 배경색:</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => pickColorFromEyeDropper((hex) => {
                              setBgColorNewColor(hex);
                              setIsBgColorModified(true);
                            })}
                            title="화면에서 색상 추출 (스포이트)"
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                          >
                            <Pipette className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="color"
                            value={bgColorNewColor}
                            onChange={(e) => {
                              setBgColorNewColor(e.target.value);
                              setIsBgColorModified(true);
                            }}
                            className="w-6 h-6 rounded border border-slate-700 bg-slate-950 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={bgColorNewColor}
                            onChange={(e) => {
                              setBgColorNewColor(e.target.value);
                              setIsBgColorModified(true);
                            }}
                            className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono text-xs focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. 감지 영역 방식 (연결된 외곽 vs 이미지 전체) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                    <span className="text-slate-400 text-[10px] font-semibold">제거 범위</span>
                    <div className="space-y-1 text-slate-300">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="bgContiguous"
                          checked={!bgColorContiguous}
                          onChange={() => {
                            setBgColorContiguous(false);
                            setIsBgColorModified(true);
                          }}
                          className="accent-indigo-500"
                        />
                        <span>이미지 전체에서 동일 색상 모두 제거</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="bgContiguous"
                          checked={bgColorContiguous}
                          onChange={() => {
                            setBgColorContiguous(true);
                            setIsBgColorModified(true);
                          }}
                          className="accent-indigo-500"
                        />
                        <span>외곽 테두리에서 연결된 배경만 제거 (내부 보존)</span>
                      </label>
                    </div>
                  </div>

                  {/* 5. 허용 오차 (Tolerance) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>색상 허용 오차 (Tolerance)</span>
                      <span className="font-mono text-indigo-400 font-bold">{bgColorTolerance}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={bgColorTolerance}
                        onChange={(e) => {
                          setBgColorTolerance(parseInt(e.target.value, 10) || 0);
                          setIsBgColorModified(true);
                        }}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={bgColorTolerance}
                          onChange={(e) => {
                            setBgColorTolerance(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)));
                            setIsBgColorModified(true);
                          }}
                          className="w-full bg-transparent text-center text-white font-mono text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 6. 가장자리 부드러움 (Smoothness) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>가장자리 부드러움 (Feather)</span>
                      <span className="font-mono text-indigo-400 font-bold">{bgColorSmoothness}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="30"
                        value={bgColorSmoothness}
                        onChange={(e) => {
                          setBgColorSmoothness(parseInt(e.target.value, 10) || 0);
                          setIsBgColorModified(true);
                        }}
                        className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={bgColorSmoothness}
                          onChange={(e) => {
                            setBgColorSmoothness(Math.max(0, Math.min(30, parseInt(e.target.value, 10) || 0)));
                            setIsBgColorModified(true);
                          }}
                          className="w-full bg-transparent text-center text-white font-mono text-xs focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">px</span>
                      </div>
                    </div>
                  </div>

                  {/* 7. Action Buttons */}
                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBgColorTarget('#ffffff');
                        setBgColorTolerance(18);
                        setBgColorSmoothness(6);
                        setBgColorContiguous(true);
                        setBgColorReplaceMode('transparent');
                        setIsBgColorModified(false);
                        setSelectedBgPreset(null);
                      }}
                      className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>설정 초기화</span>
                    </button>
                  </div>
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

              {/* ---------------- Tool: 톤 커브 (Curves - 검은색은 진하게 흰색은 더 희게 등 포토샵 곡선) ---------------- */}
              {activeTool === 'curves' && (() => {
                const currentLut = generateToneCurveLUT(curveBlacks, curveShadows, curveMidtones, curveHighlights, curveWhites);
                let pathD = `M 0 ${255 - currentLut[0]}`;
                for (let x = 4; x <= 256; x += 4) {
                  const sampleX = Math.min(255, x);
                  pathD += ` L ${sampleX} ${255 - currentLut[sampleX]}`;
                }
                const areaD = `${pathD} L 255 255 L 0 255 Z`;

                const points = [
                  { x: 0, y: 255 - currentLut[0], label: '블랙' },
                  { x: 64, y: 255 - currentLut[64], label: '암부' },
                  { x: 128, y: 255 - currentLut[128], label: '중간' },
                  { x: 192, y: 255 - currentLut[192], label: '명부' },
                  { x: 255, y: 255 - currentLut[255], label: '화이트' },
                ];

                return (
                  <div className="space-y-3 text-xs">
                    {/* 1. Visual Curve Graph */}
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-300">톤 커브 그래프</span>
                        <span className="text-[10px] text-indigo-400 font-mono">Curves Graph</span>
                      </div>

                      <div className="relative w-full aspect-[4/3] max-h-36 bg-slate-900/90 rounded-lg overflow-hidden border border-slate-800/80">
                        <svg viewBox="0 0 255 255" className="w-full h-full">
                          {/* Quadrant Grid Lines */}
                          <line x1="64" y1="0" x2="64" y2="255" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          <line x1="128" y1="0" x2="128" y2="255" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                          <line x1="192" y1="0" x2="192" y2="255" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          <line x1="0" y1="64" x2="255" y2="64" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                          <line x1="0" y1="128" x2="255" y2="128" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                          <line x1="0" y1="192" x2="255" y2="192" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

                          {/* 1:1 Diagonal Neutral Slope */}
                          <line x1="0" y1="255" x2="255" y2="0" stroke="rgba(148, 163, 184, 0.35)" strokeWidth="1.5" strokeDasharray="4 4" />

                          {/* Shaded Area Under Curve */}
                          <path d={areaD} fill="url(#curveAreaGradient)" opacity="0.25" />

                          {/* The Tone Curve */}
                          <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                          {/* Gradient definition */}
                          <defs>
                            <linearGradient id="curveAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#818cf8" />
                              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                            </linearGradient>
                          </defs>

                          {/* Control points */}
                          {points.map((pt, idx) => (
                            <circle
                              key={idx}
                              cx={pt.x}
                              cy={pt.y}
                              r="4.5"
                              className="fill-indigo-400 stroke-slate-950 stroke-2"
                            />
                          ))}
                        </svg>

                        {/* Graph labels */}
                        <div className="absolute bottom-1 left-2 text-[9px] text-slate-500 font-mono">0 (Blacks)</div>
                        <div className="absolute top-1 right-2 text-[9px] text-slate-500 font-mono">255 (Whites)</div>
                      </div>
                    </div>

                    {/* 2. Quick Presets */}
                    <div className="space-y-1.5">
                      <span className="text-slate-400 text-[10px] font-semibold">톤 프리셋</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => {
                            setCurveBlacks(-25);
                            setCurveShadows(-15);
                            setCurveMidtones(0);
                            setCurveHighlights(15);
                            setCurveWhites(275);
                          }}
                          className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 font-medium text-[11px] transition text-left cursor-pointer truncate"
                          title="검은색은 더 진하게, 흰색은 더 희게 (S-Curve)"
                        >
                          S-Curve 대비강화
                        </button>
                        <button
                          onClick={() => {
                            setCurveBlacks(-45);
                            setCurveShadows(-30);
                            setCurveMidtones(0);
                            setCurveHighlights(30);
                            setCurveWhites(285);
                          }}
                          className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white border border-slate-700 font-medium text-[11px] transition text-left cursor-pointer truncate"
                          title="강한 명암비 대비"
                        >
                          강한 대비
                        </button>
                        <button
                          onClick={() => {
                            setCurveBlacks(-40);
                            setCurveShadows(-25);
                            setCurveMidtones(-10);
                            setCurveHighlights(0);
                            setCurveWhites(255);
                          }}
                          className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-medium text-[11px] transition text-left cursor-pointer truncate"
                          title="검은색을 더 깊고 진하게"
                        >
                          검은색 진하게
                        </button>
                        <button
                          onClick={() => {
                            setCurveBlacks(0);
                            setCurveShadows(0);
                            setCurveMidtones(10);
                            setCurveHighlights(25);
                            setCurveWhites(285);
                          }}
                          className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-medium text-[11px] transition text-left cursor-pointer truncate"
                          title="흰색 및 밝은 영역 강조"
                        >
                          흰색 더 희게
                        </button>
                      </div>
                    </div>

                    {/* 3. Detailed Curve Sliders */}
                    <div className="space-y-2">
                      {/* 블랙 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400">블랙 (검은색 진하게)</span>
                          <span className="font-mono text-indigo-400">{curveBlacks > 0 ? `+${curveBlacks}` : curveBlacks}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={curveBlacks}
                            onChange={(e) => setCurveBlacks(parseInt(e.target.value, 10) || 0)}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="-100"
                              max="100"
                              value={curveBlacks}
                              onChange={(e) => setCurveBlacks(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 그림자 / 암부 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400">그림자 (Shadows)</span>
                          <span className="font-mono text-indigo-400">{curveShadows > 0 ? `+${curveShadows}` : curveShadows}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={curveShadows}
                            onChange={(e) => setCurveShadows(parseInt(e.target.value, 10) || 0)}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="-100"
                              max="100"
                              value={curveShadows}
                              onChange={(e) => setCurveShadows(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 중간 톤 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400">중간 톤 (Midtones)</span>
                          <span className="font-mono text-indigo-400">{curveMidtones > 0 ? `+${curveMidtones}` : curveMidtones}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={curveMidtones}
                            onChange={(e) => setCurveMidtones(parseInt(e.target.value, 10) || 0)}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="-100"
                              max="100"
                              value={curveMidtones}
                              onChange={(e) => setCurveMidtones(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 하이라이트 / 명부 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400">하이라이트 (Highlights)</span>
                          <span className="font-mono text-indigo-400">{curveHighlights > 0 ? `+${curveHighlights}` : curveHighlights}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="-100"
                            max="100"
                            value={curveHighlights}
                            onChange={(e) => setCurveHighlights(parseInt(e.target.value, 10) || 0)}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="-100"
                              max="100"
                              value={curveHighlights}
                              onChange={(e) => setCurveHighlights(Math.max(-100, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 화이트 */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400">화이트 (흰색 더 희게)</span>
                          <span className="font-mono text-indigo-400">{curveWhites !== 255 ? (curveWhites > 255 ? `+${curveWhites - 255}` : `${curveWhites - 255}`) : '0'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="155"
                            max="355"
                            value={curveWhites}
                            onChange={(e) => setCurveWhites(parseInt(e.target.value, 10) || 255)}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="-100"
                              max="100"
                              value={curveWhites - 255}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setCurveWhites(255 + Math.max(-100, Math.min(100, val)));
                              }}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-1.5 pt-1">
                      {isCurveModified && (
                        <button
                          onClick={handleApplyCurves}
                          className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>커브 적용</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setCurveBlacks(0);
                          setCurveShadows(0);
                          setCurveMidtones(0);
                          setCurveHighlights(0);
                          setCurveWhites(255);
                        }}
                        className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>커브 초기화</span>
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ---------------- Tool: 선명도 / 블러 (통합 패널) ---------------- */}
              {activeTool === 'sharpen' && (
                <div className="space-y-3.5 text-xs">
                  {/* 1. 선명도 (Sharpen) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                    <span className="font-bold text-slate-300 text-[11px]">선명도 조절</span>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">선명도 강도 (%)</span>
                        <span className="font-mono text-indigo-400 font-bold">{sharpenAmount}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={sharpenAmount}
                          onChange={(e) => setSharpenAmount(parseInt(e.target.value, 10) || 0)}
                          className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                        />
                        <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
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
                  </div>

                  {/* 2. 텍스트 / 선 굵게 */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-300">텍스트 / 선 굵게</span>
                      <span className="text-[10px] text-indigo-400 font-mono">
                        {textThickenStrength === 0 ? '꺼짐' : `${textThickenStrength}단계`}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      너무 얇은 글자나 선을 자연스럽게 볼드화하여 가독성을 높입니다.
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { level: 0, label: '없음' },
                        { level: 0.5, label: '0.5단계' },
                        { level: 1, label: '1단계' },
                        { level: 2, label: '2단계' },
                      ].map((item) => (
                        <button
                          key={item.level}
                          onClick={() => setTextThickenStrength(item.level)}
                          className={`py-1.5 px-1 rounded-lg border text-xs font-semibold cursor-pointer transition text-center truncate ${
                            textThickenStrength === item.level
                              ? 'border-indigo-400 bg-indigo-600/30 text-white shadow-sm'
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. 타일링 / 블러 (영역 가림) */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-300">타일링 / 블러 (영역 가림)</span>
                      <span className="text-[10px] text-sky-400 font-mono">
                        {activeMosaicMode ? '화면 드래그 활성' : '모드 선택 대기'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMosaicMode((prev) => (prev === 'mosaic' ? null : 'mosaic'));
                          if (activeMosaicMode === 'mosaic') setMosaicSelection(null);
                        }}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                          activeMosaicMode === 'mosaic'
                            ? 'border-sky-400 bg-sky-600/30 text-white shadow-sm font-bold'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        모자이크 (타일링)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMosaicMode((prev) => (prev === 'blur' ? null : 'blur'));
                          if (activeMosaicMode === 'blur') setMosaicSelection(null);
                        }}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                          activeMosaicMode === 'blur'
                            ? 'border-sky-400 bg-sky-600/30 text-white shadow-sm font-bold'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        가우시안 블러
                      </button>
                    </div>

                    {activeMosaicMode ? (
                      <p className="text-[10px] text-sky-300 font-medium bg-sky-950/40 p-1.5 rounded-lg border border-sky-800/60 leading-tight">
                        {activeMosaicMode === 'mosaic' ? '모자이크' : '가우시안 블러'} 활성화됨: 화면에서 원하는 영역을 마우스로 드래그하세요.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 leading-tight">
                        위 버튼 중 하나를 클릭하면 화면에서 가릴 영역을 드래그할 수 있습니다.
                      </p>
                    )}

                    {activeMosaicMode && (
                      <div className="space-y-1 pt-1 border-t border-slate-800/80">
                        <span className="text-slate-400 text-[10px]">
                          {activeMosaicMode === 'mosaic' ? '타일 크기 (px)' : '블러 반경 (px)'}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="4"
                            max="50"
                            value={mosaicSize}
                            onChange={(e) => setMosaicSize(parseInt(e.target.value, 10) || 4)}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-sky-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="2"
                              max="100"
                              value={mosaicSize}
                              onChange={(e) => setMosaicSize(Math.max(2, parseInt(e.target.value, 10) || 4))}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400">px</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {mosaicSelection && (
                      <div className="text-[11px] text-slate-300 font-mono bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex justify-between items-center">
                        <span>선택 영역</span>
                        <span className="text-sky-400">{mosaicSelection.width} × {mosaicSelection.height} px</span>
                      </div>
                    )}

                    {mosaicSelection && (
                      <button
                        type="button"
                        onClick={() => setMosaicSelection(null)}
                        className="w-full py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                      >
                        영역 선택 해제
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSharpenAmount(0);
                      setTextThickenStrength(0);
                      setActiveMosaicMode(null);
                      setMosaicSelection(null);
                    }}
                    className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>선명도 / 블러 초기화</span>
                  </button>
                </div>
              )}

              {/* ---------------- Tool 8: 텍스트 (객체 기반 텍스트 시스템) ---------------- */}
              {activeTool === 'text' && (
                <div className="space-y-3.5 text-xs">
                  {/* [+ 텍스트 추가] [ 배경 ] [ 테두리 ] 3버튼 그룹 (아이콘 없이 텍스트 버튼만) */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddTextItem}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>텍스트 추가</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !hasTextBg;
                        setHasTextBg(next);
                        updateSelectedTextProperty({ hasBackground: next });
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer shrink-0 ${
                        hasTextBg
                          ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow-sm shadow-indigo-500/20'
                          : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                      }`}
                      title={hasTextBg ? '배경 박스 켜짐' : '배경 박스 꺼짐'}
                    >
                      배경
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const isCurrentlyOn = textBorderWidth > 0;
                        const nextVal = isCurrentlyOn ? 0 : 2;
                        setTextBorderWidth(nextVal);
                        updateSelectedTextProperty({ borderWidth: nextVal });
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer shrink-0 ${
                        textBorderWidth > 0
                          ? 'bg-indigo-600 text-white border-indigo-400 font-bold shadow-sm shadow-indigo-500/20'
                          : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                      }`}
                      title={textBorderWidth > 0 ? '테두리 선 켜짐' : '테두리 선 꺼짐'}
                    >
                      테두리
                    </button>
                  </div>

                  {/* 선택된 텍스트 속성 편집 */}
                  {selectedTextId ? (
                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                      {/* 입력할 텍스트 */}
                      <div className="space-y-1">
                        <span className="text-slate-400 text-[10px]">입력할 텍스트 내용</span>
                        <input
                          type="text"
                          value={textString}
                          onChange={(e) => {
                            setTextString(e.target.value);
                            updateSelectedTextProperty({ text: e.target.value });
                          }}
                          placeholder="텍스트 입력"
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* 폰트 선택 */}
                      <div className="space-y-1">
                        <span className="text-slate-400 text-[10px]">폰트 (글꼴)</span>
                        <select
                          value={textFont}
                          onChange={(e) => {
                            setTextFont(e.target.value);
                            updateSelectedTextProperty({ fontFamily: e.target.value });
                          }}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
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

                      {/* 폰트 크기 */}
                      <div className="space-y-1">
                        <span className="text-slate-400 text-[10px]">폰트 크기 (px)</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="12"
                            max="180"
                            value={textSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 12;
                              setTextSize(val);
                              updateSelectedTextProperty({ fontSize: val });
                            }}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="8"
                              max="300"
                              value={textSize}
                              onChange={(e) => {
                                const val = Math.max(8, parseInt(e.target.value, 10) || 12);
                                setTextSize(val);
                                updateSelectedTextProperty({ fontSize: val });
                              }}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400">px</span>
                          </div>
                        </div>
                      </div>

                      {/* 투명도 (기본 100%) */}
                      <div className="space-y-1">
                        <span className="text-slate-400 text-[10px]">투명도 (%)</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="5"
                            max="100"
                            value={Math.round(textOpacity * 100)}
                            onChange={(e) => {
                              const val = (parseInt(e.target.value, 10) || 5) / 100;
                              setTextOpacity(val);
                              updateSelectedTextProperty({ opacity: val });
                            }}
                            className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                          />
                          <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                            <input
                              type="number"
                              min="5"
                              max="100"
                              value={Math.round(textOpacity * 100)}
                              onChange={(e) => {
                                const val = Math.min(100, Math.max(5, parseInt(e.target.value, 10) || 5)) / 100;
                                setTextOpacity(val);
                                updateSelectedTextProperty({ opacity: val });
                              }}
                              className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-400">%</span>
                          </div>
                        </div>
                      </div>

                      {/* 텍스트 색상 + 스포이트 */}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                        <span className="text-slate-300 font-medium">텍스트 색상</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => pickColorFromEyeDropper((col) => {
                              setTextColor(col);
                              updateSelectedTextProperty({ color: col });
                            })}
                            title="스포이트로 색상 추출"
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                          >
                            <Pipette className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="color"
                            value={textColor}
                            onChange={(e) => {
                              setTextColor(e.target.value);
                              updateSelectedTextProperty({ color: e.target.value });
                            }}
                            className="w-6 h-6 rounded border border-slate-700 bg-slate-900 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={textColor}
                            onChange={(e) => {
                              setTextColor(e.target.value);
                              updateSelectedTextProperty({ color: e.target.value });
                            }}
                            className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono text-xs focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* 배경 설정 (체크박스 없이 상단 [배경] 버튼으로 연동) */}
                      {hasTextBg && (
                        <>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                            <span className="text-slate-300 font-medium">배경 색상</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => pickColorFromEyeDropper((col) => {
                                  setTextBgColor(col);
                                  updateSelectedTextProperty({ backgroundColor: col });
                                })}
                                title="스포이트로 색상 추출"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                              >
                                <Pipette className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="color"
                                value={textBgColor}
                                onChange={(e) => {
                                  setTextBgColor(e.target.value);
                                  updateSelectedTextProperty({ backgroundColor: e.target.value });
                                }}
                                className="w-6 h-6 rounded border border-slate-700 bg-slate-900 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={textBgColor}
                                onChange={(e) => {
                                  setTextBgColor(e.target.value);
                                  updateSelectedTextProperty({ backgroundColor: e.target.value });
                                }}
                                className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono text-xs focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-slate-400 text-[10px]">모서리 둥글게 (px)</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="0"
                                max="60"
                                value={textBorderRadius}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 0;
                                  setTextBorderRadius(val);
                                  updateSelectedTextProperty({ backgroundRadius: val });
                                }}
                                className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                              />
                              <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={textBorderRadius}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setTextBorderRadius(val);
                                    updateSelectedTextProperty({ backgroundRadius: val });
                                  }}
                                  className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-400">px</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* 테두리 설정 (상단 [테두리] 버튼으로 연동) */}
                      {textBorderWidth > 0 && (
                        <>
                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                            <span className="text-slate-300 font-medium">테두리 색상</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => pickColorFromEyeDropper((col) => {
                                  setTextBorderColor(col);
                                  updateSelectedTextProperty({ borderColor: col });
                                })}
                                title="스포이트로 색상 추출"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition cursor-pointer"
                              >
                                <Pipette className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="color"
                                value={textBorderColor}
                                onChange={(e) => {
                                  setTextBorderColor(e.target.value);
                                  updateSelectedTextProperty({ borderColor: e.target.value });
                                }}
                                className="w-6 h-6 rounded border border-slate-700 bg-slate-900 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={textBorderColor}
                                onChange={(e) => {
                                  setTextBorderColor(e.target.value);
                                  updateSelectedTextProperty({ borderColor: e.target.value });
                                }}
                                className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono text-xs focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-slate-400 text-[10px]">테두리 선 모양</span>
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { id: 'solid', label: '실선' },
                                { id: 'dashed', label: '점선' },
                                { id: 'dotted', label: '둥근 점' },
                              ].map((style) => (
                                <button
                                  key={style.id}
                                  type="button"
                                  onClick={() => {
                                    const val = style.id as 'solid' | 'dashed' | 'dotted';
                                    setTextBorderStyle(val);
                                    updateSelectedTextProperty({ borderStyle: val });
                                  }}
                                  className={`py-1 rounded-lg border text-xs font-semibold cursor-pointer transition text-center ${
                                    textBorderStyle === style.id
                                      ? 'border-indigo-400 bg-indigo-600/30 text-white shadow-sm'
                                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {style.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-slate-400 text-[10px]">테두리 두께 (px)</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="1"
                                max="20"
                                value={textBorderWidth}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10) || 1;
                                  setTextBorderWidth(val);
                                  updateSelectedTextProperty({ borderWidth: val });
                                }}
                                className="flex-1 h-1.5 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                              />
                              <div className="flex items-center gap-1 w-16 shrink-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                                <input
                                  type="number"
                                  min="1"
                                  max="40"
                                  value={textBorderWidth}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    setTextBorderWidth(val);
                                    updateSelectedTextProperty({ borderWidth: val });
                                  }}
                                  className="w-full bg-transparent text-white font-mono text-xs text-right focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-400">px</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* 삭제 버튼 */}
                      <button
                        onClick={handleDeleteSelectedText}
                        className="w-full py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-semibold text-xs border border-rose-800/60 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>선택된 텍스트 삭제</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80 text-center text-slate-400 text-xs">
                      [+ 텍스트 추가] 버튼을 눌러 새 텍스트를 배치하거나, 캔버스의 텍스트 객체를 클릭하여 편집하세요.
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
