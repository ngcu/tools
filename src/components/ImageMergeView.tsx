import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Copy,
  CheckCircle2,
  Trash2,
  Layers,
  Maximize2,
  RotateCcw,
  Sliders,
  Check,
  SplitSquareVertical,
  SplitSquareHorizontal,
  Grid2X2,
  Grid3X3,
  Image as ImageIcon,
  Lock,
  Unlock,
  Percent,
  MoveHorizontal,
  ChevronLeft,
  ChevronRight,
  Plus,
  Info
} from 'lucide-react';

export interface LoadedImage {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  size: number;
  aspectRatio: number;
}

export type GridPreset = 'horizontal' | 'vertical' | '2-col' | '3-col';
export type FitMode = 'natural' | 'contain' | 'cover';
export type ResizeMode = 'original' | 'scale' | 'pixel';

interface BaseMergeLayout {
  totalWidth: number;
  totalHeight: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  placements: Array<{
    img: LoadedImage;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
    sx?: number;
    sy?: number;
    sw?: number;
    sh?: number;
  }>;
}

export const ImageMergeView: React.FC = () => {
  // Images list (Max 6)
  const [images, setImages] = useState<LoadedImage[]>([]);

  // Layout & Alignment Settings
  const [preset, setPreset] = useState<GridPreset>('horizontal');
  const [fitMode, setFitMode] = useState<FitMode>('natural');
  const [gap, setGap] = useState<number>(0);
  const [bgColor, setBgColor] = useState<'white' | 'black' | 'dark' | 'transparent'>('white');
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [quality, setQuality] = useState<number>(0.92);

  // Check if current format supports transparency
  const supportsTransparency = format === 'png' || format === 'webp';

  // If format changes to JPG and transparent was selected, fallback to white
  useEffect(() => {
    if (!supportsTransparency && bgColor === 'transparent') {
      setBgColor('white');
    }
  }, [supportsTransparency, bgColor]);

  // Resize Controls (Scale or Direct px)
  const [resizeMode, setResizeMode] = useState<ResizeMode>('original');
  const [scalePercent, setScalePercent] = useState<number>(100);
  const [targetWidth, setTargetWidth] = useState<number | ''>('');
  const [targetHeight, setTargetHeight] = useState<number | ''>('');
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);

  // Base and Final Merged Results
  const [baseDimensions, setBaseDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [mergedDataUrl, setMergedDataUrl] = useState<string | null>(null);
  const [mergedBlob, setMergedBlob] = useState<Blob | null>(null);
  const [mergedDimensions, setMergedDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Read single file into LoadedImage
  const processImageFile = (file: File): Promise<LoadedImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          resolve({
            id: Math.random().toString(36).substring(7),
            name: file.name,
            dataUrl,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            size: file.size,
            aspectRatio: (img.naturalWidth || img.width) / (img.naturalHeight || img.height),
          });
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Add multiple files (up to max 6)
  const handleAddFiles = async (fileList: FileList | File[]) => {
    const validFiles = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const remainingSlots = 6 - images.length;
    if (remainingSlots <= 0) {
      alert('최대 6개까지만 이미지를 등록할 수 있습니다.');
      return;
    }

    const filesToLoad = validFiles.slice(0, remainingSlots);
    const newLoadedImages: LoadedImage[] = [];

    for (const file of filesToLoad) {
      try {
        const loaded = await processImageFile(file);
        newLoadedImages.push(loaded);
      } catch (err) {
        console.error('이미지 로딩 실패:', err);
      }
    }

    setImages((prev) => [...prev, ...newLoadedImages]);
  };

  // Drag and drop for multi-files
  const handleDropMulti = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  // Remove single image
  const handleRemoveImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Move order
  const handleMoveOrder = (index: number, direction: 'prev' | 'next', e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'prev' && index > 0) {
      setImages((prev) => {
        const copy = [...prev];
        const temp = copy[index - 1];
        copy[index - 1] = copy[index];
        copy[index] = temp;
        return copy;
      });
    } else if (direction === 'next' && index < images.length - 1) {
      setImages((prev) => {
        const copy = [...prev];
        const temp = copy[index + 1];
        copy[index + 1] = copy[index];
        copy[index] = temp;
        return copy;
      });
    }
  };

  // Clear all images
  const handleClearAll = () => {
    setImages([]);
    setMergedDataUrl(null);
    setMergedBlob(null);
  };

  // Calculate Grid Layout: columns, rows, cell dimensions, and element placements
  const calculateBaseLayout = useCallback((): BaseMergeLayout => {
    if (images.length === 0) {
      return { totalWidth: 0, totalHeight: 0, cellWidth: 0, cellHeight: 0, columns: 1, rows: 1, placements: [] };
    }

    const count = images.length;
    const maxW = Math.max(...images.map((im) => im.width));
    const maxH = Math.max(...images.map((im) => im.height));

    // 1. 가로 1줄 레이아웃 (Horizontal - 1 Row)
    if (preset === 'horizontal') {
      if (fitMode === 'natural') {
        // [요구사항] 가로 1줄: 높이를 동일하게 맞추고 여백 보존 없이 순서대로 배치
        const targetH = maxH;
        const itemSizes = images.map((img) => {
          const dh = targetH;
          const dw = Math.max(1, Math.round(targetH * img.aspectRatio));
          return { dw, dh };
        });

        const totalWidth = itemSizes.reduce((sum, item) => sum + item.dw, 0) + Math.max(0, count - 1) * gap;
        const totalHeight = targetH;

        const placements: BaseMergeLayout['placements'] = [];
        let currentX = 0;
        images.forEach((img, idx) => {
          const { dw, dh } = itemSizes[idx];
          placements.push({
            img,
            dx: currentX,
            dy: 0,
            dw,
            dh,
          });
          currentX += dw + gap;
        });

        return {
          totalWidth,
          totalHeight,
          cellWidth: 0,
          cellHeight: targetH,
          columns: count,
          rows: 1,
          placements,
        };
      } else {
        // 균등 셀 가로 (contain: 여백 보존, cover: 크롭)
        const cellWidth = maxW;
        const cellHeight = maxH;
        const totalWidth = count * cellWidth + Math.max(0, count - 1) * gap;
        const totalHeight = cellHeight;
        const placements: BaseMergeLayout['placements'] = [];

        images.forEach((img, idx) => {
          const cellX = idx * (cellWidth + gap);
          const cellY = 0;
          if (fitMode === 'contain') {
            const cellRatio = cellWidth / cellHeight;
            let dw = cellWidth;
            let dh = cellHeight;
            if (img.aspectRatio > cellRatio) {
              dw = cellWidth;
              dh = Math.round(cellWidth / img.aspectRatio);
            } else {
              dh = cellHeight;
              dw = Math.round(cellHeight * img.aspectRatio);
            }
            const dx = cellX + Math.round((cellWidth - dw) / 2);
            const dy = cellY + Math.round((cellHeight - dh) / 2);
            placements.push({ img, dx, dy, dw, dh });
          } else {
            // cover
            placements.push({ img, dx: cellX, dy: cellY, dw: cellWidth, dh: cellHeight });
          }
        });

        return { totalWidth, totalHeight, cellWidth, cellHeight, columns: count, rows: 1, placements };
      }
    }

    // 2. 세로 1줄 레이아웃 (Vertical - 1 Column)
    if (preset === 'vertical') {
      if (fitMode === 'natural') {
        // [요구사항] 세로 1줄: 너비를 동일하게 맞추고 여백 보존 없이 순서대로 배치
        const targetW = maxW;
        const itemSizes = images.map((img) => {
          const dw = targetW;
          const dh = Math.max(1, Math.round(targetW / img.aspectRatio));
          return { dw, dh };
        });

        const totalWidth = targetW;
        const totalHeight = itemSizes.reduce((sum, item) => sum + item.dh, 0) + Math.max(0, count - 1) * gap;

        const placements: BaseMergeLayout['placements'] = [];
        let currentY = 0;
        images.forEach((img, idx) => {
          const { dw, dh } = itemSizes[idx];
          placements.push({
            img,
            dx: 0,
            dy: currentY,
            dw,
            dh,
          });
          currentY += dh + gap;
        });

        return {
          totalWidth,
          totalHeight,
          cellWidth: targetW,
          cellHeight: 0,
          columns: 1,
          rows: count,
          placements,
        };
      } else {
        // 균등 셀 세로 (contain: 여백 보존, cover: 크롭)
        const cellWidth = maxW;
        const cellHeight = maxH;
        const totalWidth = cellWidth;
        const totalHeight = count * cellHeight + Math.max(0, count - 1) * gap;
        const placements: BaseMergeLayout['placements'] = [];

        images.forEach((img, idx) => {
          const cellX = 0;
          const cellY = idx * (cellHeight + gap);
          if (fitMode === 'contain') {
            const cellRatio = cellWidth / cellHeight;
            let dw = cellWidth;
            let dh = cellHeight;
            if (img.aspectRatio > cellRatio) {
              dw = cellWidth;
              dh = Math.round(cellWidth / img.aspectRatio);
            } else {
              dh = cellHeight;
              dw = Math.round(cellHeight * img.aspectRatio);
            }
            const dx = cellX + Math.round((cellWidth - dw) / 2);
            const dy = cellY + Math.round((cellHeight - dh) / 2);
            placements.push({ img, dx, dy, dw, dh });
          } else {
            // cover
            placements.push({ img, dx: cellX, dy: cellY, dw: cellWidth, dh: cellHeight });
          }
        });

        return { totalWidth, totalHeight, cellWidth, cellHeight, columns: 1, rows: count, placements };
      }
    }

    // 3. 2열 / 3열 그리드 (Grid Presets)
    let columns = 1;
    if (preset === '2-col') {
      columns = Math.min(2, count);
    } else if (preset === '3-col') {
      columns = Math.min(3, count);
    }
    const rows = Math.ceil(count / columns);

    const cellWidth = maxW;
    const cellHeight = maxH;

    const totalWidth = columns * cellWidth + Math.max(0, columns - 1) * gap;
    const totalHeight = rows * cellHeight + Math.max(0, rows - 1) * gap;

    const placements: BaseMergeLayout['placements'] = [];

    images.forEach((img, idx) => {
      const col = idx % columns;
      const row = Math.floor(idx / columns);

      const cellX = col * (cellWidth + gap);
      const cellY = row * (cellHeight + gap);

      if (fitMode === 'cover') {
        placements.push({ img, dx: cellX, dy: cellY, dw: cellWidth, dh: cellHeight });
      } else {
        // contain 또는 natural(그리드에서는 균등 셀 내 비율 유지 letterboxing)
        const cellRatio = cellWidth / cellHeight;
        let dw = cellWidth;
        let dh = cellHeight;

        if (img.aspectRatio > cellRatio) {
          dw = cellWidth;
          dh = Math.round(cellWidth / img.aspectRatio);
        } else {
          dh = cellHeight;
          dw = Math.round(cellHeight * img.aspectRatio);
        }

        const dx = cellX + Math.round((cellWidth - dw) / 2);
        const dy = cellY + Math.round((cellHeight - dh) / 2);

        placements.push({ img, dx, dy, dw, dh });
      }
    });

    return { totalWidth, totalHeight, cellWidth, cellHeight, columns, rows, placements };
  }, [images, preset, fitMode, gap]);

  // Sync base dimensions
  useEffect(() => {
    if (images.length >= 2) {
      const layout = calculateBaseLayout();
      setBaseDimensions({ width: layout.totalWidth, height: layout.totalHeight });
      if (resizeMode === 'original' || targetWidth === '') {
        setTargetWidth(layout.totalWidth);
        setTargetHeight(layout.totalHeight);
      }
    }
  }, [images, calculateBaseLayout]);

  // Pixel Width input change handler
  const handleTargetWidthChange = (valStr: string) => {
    if (valStr === '') {
      setTargetWidth('');
      return;
    }
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val <= 0) return;
    setTargetWidth(val);

    if (lockAspectRatio && baseDimensions.width > 0 && baseDimensions.height > 0) {
      const ratio = baseDimensions.height / baseDimensions.width;
      setTargetHeight(Math.round(val * ratio));
    }
  };

  // Pixel Height input change handler
  const handleTargetHeightChange = (valStr: string) => {
    if (valStr === '') {
      setTargetHeight('');
      return;
    }
    const val = parseInt(valStr, 10);
    if (isNaN(val) || val <= 0) return;
    setTargetHeight(val);

    if (lockAspectRatio && baseDimensions.width > 0 && baseDimensions.height > 0) {
      const ratio = baseDimensions.width / baseDimensions.height;
      setTargetWidth(Math.round(val * ratio));
    }
  };

  // Merge Calculation & High Quality Canvas Rendering
  const performMerge = useCallback(async () => {
    if (images.length < 2) {
      setMergedDataUrl(null);
      setMergedBlob(null);
      return;
    }

    setIsProcessing(true);

    try {
      const layout = calculateBaseLayout();
      const baseW = layout.totalWidth;
      const baseH = layout.totalHeight;

      if (baseW <= 0 || baseH <= 0) {
        setIsProcessing(false);
        return;
      }

      // Step 1: Base Composite Canvas
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = baseW;
      baseCanvas.height = baseH;
      const baseCtx = baseCanvas.getContext('2d');
      if (!baseCtx) return;

      // Fill background
      if (bgColor === 'white') {
        baseCtx.fillStyle = '#ffffff';
        baseCtx.fillRect(0, 0, baseW, baseH);
      } else if (bgColor === 'black') {
        baseCtx.fillStyle = '#000000';
        baseCtx.fillRect(0, 0, baseW, baseH);
      } else if (bgColor === 'dark') {
        baseCtx.fillStyle = '#0f172a';
        baseCtx.fillRect(0, 0, baseW, baseH);
      } else {
        baseCtx.clearRect(0, 0, baseW, baseH);
      }

      baseCtx.imageSmoothingEnabled = true;
      baseCtx.imageSmoothingQuality = 'high';

      // Load and draw each image
      for (const item of layout.placements) {
        const imgElem = new Image();
        imgElem.src = item.img.dataUrl;
        await new Promise((res) => (imgElem.onload = res));

        baseCtx.drawImage(imgElem, item.dx, item.dy, item.dw, item.dh);
      }

      // Step 2: Determine Final Output Dimensions (Scale or Pixels)
      let finalW = baseW;
      let finalH = baseH;

      if (resizeMode === 'scale') {
        const factor = Math.max(10, Math.min(400, scalePercent)) / 100;
        finalW = Math.round(baseW * factor);
        finalH = Math.round(baseH * factor);
      } else if (resizeMode === 'pixel') {
        finalW = typeof targetWidth === 'number' && targetWidth > 0 ? targetWidth : baseW;
        finalH = typeof targetHeight === 'number' && targetHeight > 0 ? targetHeight : baseH;
      }

      // Step 3: Draw on Final Output Canvas
      let outputCanvas = baseCanvas;
      if (finalW !== baseW || finalH !== baseH) {
        outputCanvas = document.createElement('canvas');
        outputCanvas.width = finalW;
        outputCanvas.height = finalH;
        const outCtx = outputCanvas.getContext('2d');
        if (outCtx) {
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = 'high';
          outCtx.drawImage(baseCanvas, 0, 0, finalW, finalH);
        }
      }

      const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const outputQuality = format === 'png' ? undefined : quality;

      outputCanvas.toBlob(
        (blob) => {
          if (blob) {
            setMergedBlob(blob);
            setMergedDimensions({ width: finalW, height: finalH });
            const url = URL.createObjectURL(blob);
            setMergedDataUrl(url);
          }
          setIsProcessing(false);
        },
        mimeType,
        outputQuality
      );
    } catch (err) {
      console.error('Merge rendering error:', err);
      setIsProcessing(false);
    }
  }, [
    images,
    calculateBaseLayout,
    bgColor,
    format,
    quality,
    resizeMode,
    scalePercent,
    targetWidth,
    targetHeight,
  ]);

  // Re-run merge when parameters change
  useEffect(() => {
    performMerge();
  }, [performMerge]);

  // Download Merged Image
  const handleDownload = () => {
    if (!mergedDataUrl) return;
    const link = document.createElement('a');
    link.download = `merged_${images.length}_images_${mergedDimensions.width}x${mergedDimensions.height}.${format}`;
    link.href = mergedDataUrl;
    link.click();
  };

  // Copy Merged Image to Clipboard
  const handleCopy = async () => {
    if (!mergedBlob) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        let copyBlob = mergedBlob;
        if (mergedBlob.type !== 'image/png') {
          const img = new Image();
          img.src = mergedDataUrl!;
          await new Promise((res) => (img.onload = res));
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          copyBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
        }

        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': copyBlob,
          }),
        ]);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        alert('이 브라우저는 클립보드 이미지 복사를 지원하지 않습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full space-y-4 pb-8">
      {/* Hidden Multi-file input */}
      <input
        type="file"
        ref={multiFileInputRef}
        onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: 6 Slots Image Manager & Compact Options (lg:col-span-5)      */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-3">
          {/* 1. 6-Image Slot Container & Multi-Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropMulti}
            className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-2.5"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white">
                  이미지 등록 ({images.length}/6개)
                </span>
                <span className="text-[10px] text-slate-400 ml-1">
                  (최소 2개 ~ 최대 6개)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {images.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition cursor-pointer"
                  >
                    전체 비우기
                  </button>
                )}
                {images.length < 6 && (
                  <button
                    onClick={() => multiFileInputRef.current?.click()}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    <span>추가</span>
                  </button>
                )}
              </div>
            </div>

            {/* 6-Slot Horizontal Row (grid-cols-6, compact 1-row layout) */}
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 6 }).map((_, slotIdx) => {
                const img = images[slotIdx];
                return (
                  <div
                    key={slotIdx}
                    onClick={() => {
                      if (!img) multiFileInputRef.current?.click();
                    }}
                    className={`relative rounded-xl border aspect-square flex flex-col items-center justify-center p-0.5 transition overflow-hidden ${
                      img
                        ? 'border-indigo-500/50 bg-slate-950/90 shadow-sm'
                        : 'border-dashed border-slate-800 bg-slate-950/40 hover:border-indigo-500/50 hover:bg-slate-900/50 cursor-pointer'
                    }`}
                  >
                    {img ? (
                      <div className="w-full h-full relative group flex items-center justify-center">
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="max-h-full max-w-full object-contain rounded"
                        />
                        {/* Number Badge */}
                        <div className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded text-[8px] font-bold bg-indigo-600 text-white shadow">
                          #{slotIdx + 1}
                        </div>

                        {/* Top-Right Delete Button */}
                        <button
                          onClick={(e) => handleRemoveImage(slotIdx, e)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded bg-slate-900/90 hover:bg-red-500 text-slate-300 hover:text-white transition cursor-pointer"
                          title="삭제"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>

                        {/* Order Navigation (< >) Buttons Overlay */}
                        <div className="absolute inset-x-0 bottom-0 bg-slate-950/90 py-0.5 px-0.5 flex items-center justify-between text-[8px] opacity-80 group-hover:opacity-100 transition">
                          <button
                            onClick={(e) => handleMoveOrder(slotIdx, 'prev', e)}
                            disabled={slotIdx === 0}
                            className="p-0.5 hover:text-indigo-400 disabled:opacity-20 cursor-pointer"
                            title="앞으로 이동"
                          >
                            <ChevronLeft className="w-2.5 h-2.5" />
                          </button>
                          <span className="text-[7px] text-slate-400 font-mono truncate hidden sm:inline">
                            {img.width}×{img.height}
                          </span>
                          <button
                            onClick={(e) => handleMoveOrder(slotIdx, 'next', e)}
                            disabled={slotIdx === images.length - 1}
                            className="p-0.5 hover:text-indigo-400 disabled:opacity-20 cursor-pointer"
                            title="뒤로 이동"
                          >
                            <ChevronRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-600 space-y-0.5">
                        <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400" />
                        <span className="text-[8px] font-medium text-slate-500">
                          #{slotIdx + 1}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Layout Preset Selection (가로, 세로, 2열, 3열 그리드 자유 선택) */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-2.5">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <h3 className="font-bold text-white text-xs">배열 레이아웃 설정</h3>
            </div>

            {/* 4 Presets: Horizontal, Vertical, 2-Col, 3-Col */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: '2-col', label: '2열 그리드', icon: Grid2X2, desc: '2x3 / 2x2' },
                { id: '3-col', label: '3열 그리드', icon: Grid3X3, desc: '3x2 / 3x1' },
                { id: 'horizontal', label: '가로 1줄', icon: SplitSquareHorizontal, desc: '1 x N 가로' },
                { id: 'vertical', label: '세로 1줄', icon: SplitSquareVertical, desc: 'N x 1 세로' },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = preset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPreset(item.id as GridPreset)}
                    className={`py-1.5 px-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-bold shadow-sm'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[11px]">{item.label}</span>
                    <span className="text-[9px] text-slate-500">{item.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Fit mode & Alignment */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 block">
                  셀 크기 및 비율 맞춤 방식
                </label>
                {preset === 'horizontal' && (
                  <span className="text-[10px] text-indigo-400 font-medium">가로 1줄: 높이 일치 맞춤</span>
                )}
                {preset === 'vertical' && (
                  <span className="text-[10px] text-indigo-400 font-medium">세로 1줄: 너비 일치 맞춤</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  {
                    id: 'natural',
                    title: '여백 없음',
                    desc: preset === 'horizontal' ? '높이 맞춤' : preset === 'vertical' ? '너비 맞춤' : '자연 비율',
                  },
                  {
                    id: 'contain',
                    title: '비율 유지',
                    desc: '여백 보존',
                  },
                  {
                    id: 'cover',
                    title: '셀 꽉 채우기',
                    desc: '중앙 크롭',
                  },
                ].map((item) => {
                  const isSelected = fitMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFitMode(item.id as FitMode)}
                      className={`py-1.5 px-1.5 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-bold shadow-xs'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      <span className="text-[11px] leading-tight">{item.title}</span>
                      <span className="text-[9px] text-slate-500">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gap & Background Color */}
            <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-800/80">
              {/* Gap (기본값 0px) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>이미지 간격</span>
                  <span className="text-white font-mono">{gap}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={gap}
                  onChange={(e) => setGap(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                  <span>0px</span>
                  <span>10px</span>
                  <span>20px</span>
                  <span>40px</span>
                </div>
              </div>

              {/* Background Color (기본 화이트, 투명 맨 뒤 및 JPG시 비활성화) */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>여백 배경색</span>
                  <span className="capitalize text-slate-300">
                    {bgColor === 'white' ? '화이트' : bgColor === 'black' ? '블랙' : bgColor === 'dark' ? '다크' : '투명'}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[
                    { val: 'white', title: '화이트', supported: true },
                    { val: 'black', title: '블랙', supported: true },
                    { val: 'dark', title: '다크', supported: true },
                    { val: 'transparent', title: '투명', supported: supportsTransparency },
                  ].map((bg) => {
                    const isSelected = bgColor === bg.val;
                    return (
                      <button
                        key={bg.val}
                        type="button"
                        disabled={!bg.supported}
                        onClick={() => setBgColor(bg.val as any)}
                        title={!bg.supported ? 'JPG 포맷은 투명을 지원하지 않습니다.' : bg.title}
                        className={`flex-1 py-1 rounded border text-[10px] transition ${
                          !bg.supported
                            ? 'opacity-30 border-slate-900 bg-slate-950 text-slate-600 cursor-not-allowed'
                            : isSelected
                            ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-bold cursor-pointer'
                            : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400 cursor-pointer'
                        }`}
                      >
                        {bg.title}
                      </button>
                    );
                  })}
                </div>
                {!supportsTransparency && (
                  <p className="text-[9px] text-amber-400/80 leading-tight">
                    * JPG 포맷은 투명을 지원하지 않아 화이트/컬러 배경이 적용됩니다.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 3. Output Size & Scaling Controls (배율 혹은 px로 크기 조정) */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <h3 className="font-bold text-white text-xs">최종 이미지 크기 조절</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                기준: {baseDimensions.width}×{baseDimensions.height}px
              </span>
            </div>

            {/* Mode Switch Tabs: [원본 (100%)] | [배율 (%)] | [직접 픽셀 (px)] */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setResizeMode('original')}
                className={`py-1 px-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  resizeMode === 'original'
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                }`}
              >
                100% 원본
              </button>

              <button
                type="button"
                onClick={() => setResizeMode('scale')}
                className={`py-1 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                  resizeMode === 'scale'
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                }`}
              >
                <Percent className="w-3 h-3" />
                <span>배율 (%)</span>
              </button>

              <button
                type="button"
                onClick={() => setResizeMode('pixel')}
                className={`py-1 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                  resizeMode === 'pixel'
                    ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                }`}
              >
                <MoveHorizontal className="w-3 h-3" />
                <span>직접 px</span>
              </button>
            </div>

            {/* Scale controls */}
            {resizeMode === 'scale' && (
              <div className="space-y-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">배율 지정 (1% ~ 300%)</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={scalePercent}
                      onChange={(e) => setScalePercent(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 100)))}
                      className="w-14 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-white font-mono text-xs text-right focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-slate-400 text-xs font-bold">%</span>
                  </div>
                </div>

                {/* 배율 게이지: 1% ~ 300%, 10단위 조정, 50단위 눈금 */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min="1"
                    max="300"
                    step="10"
                    list="scale-marks"
                    value={scalePercent}
                    onChange={(e) => setScalePercent(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <datalist id="scale-marks">
                    <option value="1" />
                    <option value="50" />
                    <option value="100" />
                    <option value="150" />
                    <option value="200" />
                    <option value="250" />
                    <option value="300" />
                  </datalist>
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono px-0.5">
                    <span>1%</span>
                    <span>50%</span>
                    <span>100%</span>
                    <span>150%</span>
                    <span>200%</span>
                    <span>250%</span>
                    <span>300%</span>
                  </div>
                </div>

                {/* 프리셋 버튼: 20, 40, 60, 80, 100, 150, 200, 300 */}
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 pt-0.5">
                  {[20, 40, 60, 80, 100, 150, 200, 300].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setScalePercent(pct)}
                      className={`py-1 rounded text-[10px] font-semibold border transition cursor-pointer text-center ${
                        scalePercent === pct
                          ? 'border-indigo-500 bg-indigo-600/30 text-indigo-300 shadow-xs'
                          : 'border-slate-800 bg-slate-900 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Direct Pixel controls */}
            {resizeMode === 'pixel' && (
              <div className="space-y-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">픽셀(px) 직접 입력</span>
                  <button
                    type="button"
                    onClick={() => setLockAspectRatio(!lockAspectRatio)}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition cursor-pointer ${
                      lockAspectRatio
                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}
                  >
                    {lockAspectRatio ? <Lock className="w-2.5 h-2.5 text-indigo-400" /> : <Unlock className="w-2.5 h-2.5" />}
                    <span>{lockAspectRatio ? '종횡비 고정' : '자유 비율'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] text-slate-400 block">너비 (Width)</label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        placeholder="Width"
                        value={targetWidth}
                        onChange={(e) => handleTargetWidthChange(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 pr-6"
                      />
                      <span className="absolute right-1.5 text-[9px] text-slate-500 pointer-events-none">px</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[10px] text-slate-400 block">높이 (Height)</label>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        placeholder="Height"
                        value={targetHeight}
                        onChange={(e) => handleTargetHeightChange(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 pr-6"
                      />
                      <span className="absolute right-1.5 text-[9px] text-slate-500 pointer-events-none">px</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetWidth(baseDimensions.width);
                      setTargetHeight(baseDimensions.height);
                    }}
                    className="text-[9px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>합성 원본 크기로 초기화</span>
                  </button>
                </div>
              </div>
            )}

            {/* Format & Quality */}
            <div className="pt-1 flex items-center justify-between border-t border-slate-800/80 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-300 font-medium">포맷</span>
                <span className="text-[10px] text-slate-500">(기본: JPG)</span>
              </div>
              <div className="flex gap-1">
                {[
                  { id: 'jpeg', label: 'JPG' },
                  { id: 'png', label: 'PNG' },
                  { id: 'webp', label: 'WEBP' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormat(item.id as any)}
                    className={`px-2.5 py-0.5 text-center text-xs font-semibold rounded-md border transition cursor-pointer ${
                      format === item.id
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Live Merged Preview & Export (lg:col-span-7)                */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-3">
          {/* Header Action Bar */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                병합 미리보기
              </h3>
              {mergedDimensions.width > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono">
                  <span>최종: <strong className="text-indigo-400">{mergedDimensions.width} × {mergedDimensions.height} px</strong></span>
                  {mergedBlob && (
                    <>
                      <span>•</span>
                      <span>{formatFileSize(mergedBlob.size)}</span>
                    </>
                  )}
                  {resizeMode === 'scale' && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-sans">
                      {scalePercent}% 배율
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleCopy}
                disabled={!mergedDataUrl || isProcessing}
                className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer"
                title="클립보드로 복사"
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">복사 완료!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>클립보드 복사</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownload}
                disabled={!mergedDataUrl || isProcessing}
                className="flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md shadow-indigo-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>병합 이미지 다운로드</span>
              </button>
            </div>
          </div>

          {/* Viewport: Scrollable and fits cleanly in view without overflowing */}
          <div className="relative min-h-[380px] max-h-[580px] rounded-2xl bg-slate-950/80 border border-slate-800 shadow-xl overflow-auto flex items-center justify-center p-4">
            {mergedDataUrl ? (
              <div className="relative group max-w-full max-h-full flex items-center justify-center">
                <img
                  src={mergedDataUrl}
                  alt="Merged Preview"
                  className="max-h-[520px] max-w-full object-contain rounded-lg shadow-2xl border border-slate-800/80"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-2 p-8 text-slate-500">
                <Layers className="w-10 h-10 text-slate-600 animate-pulse" />
                <p className="text-sm font-semibold text-slate-400">
                  {images.length < 2
                    ? '최소 2개 이상의 이미지를 등록하면 실시간 병합 미리보기가 표시됩니다'
                    : '병합 이미지를 렌더링 중입니다...'}
                </p>
                <p className="text-xs text-slate-500">
                  최대 6개까지 이미지를 추가하고 2열, 3열, 가로, 세로 배열을 자유롭게 선택하세요
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
