import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Download,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  Sliders,
  ZoomIn,
  RotateCw,
  X,
  FileArchive,
  RefreshCw,
  CheckSquare,
  Square,
  ArrowDownToLine,
  Check
} from 'lucide-react';
import JSZip from 'jszip';
import {
  loadPDFDocument,
  convertPDFPagesToImages,
  ConvertedPage,
  PDFMetadata,
  getScaleForDpi
} from '../utils/pdfConverter';
import * as pdfjsLib from 'pdfjs-dist';

export const PdfToImageView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, text: '' });
  const [convertedPages, setConvertedPages] = useState<ConvertedPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

  // Settings
  const [dpi, setDpi] = useState<number>(300);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality] = useState<number>(0.92);
  const [pageSelection, setPageSelection] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState<string>('');

  // Selected images for batch export (Checkbox selection)
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<Set<number>>(new Set());

  // Preview Modal
  const [activeModalPage, setActiveModalPage] = useState<ConvertedPage | null>(null);
  const [modalRotation, setModalRotation] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse page selection
  const computeSelectedPages = (numPages: number): number[] => {
    if (pageSelection === 'all') {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }
    if (!customRange.trim()) {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }

    const pages = new Set<number>();
    const parts = customRange.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.max(1, start); p <= Math.min(numPages, end); p++) {
            pages.add(p);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= numPages) {
          pages.add(p);
        }
      }
    }
    const result = Array.from(pages).sort((a, b) => a - b);
    return result.length > 0 ? result : Array.from({ length: numPages }, (_, i) => i + 1);
  };

  const handleFileProcess = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일(.pdf)만 업로드할 수 있습니다.');
      return;
    }

    try {
      setError(null);
      setConvertedPages([]);
      setSelectedPageNumbers(new Set());
      setFile(selectedFile);

      const arrayBuffer = await selectedFile.arrayBuffer();
      const doc = await loadPDFDocument(arrayBuffer);

      setPdfDoc(doc);
      setMetadata({
        numPages: doc.numPages,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
      });

      setCustomRange(`1-${doc.numPages}`);
    } catch (err: unknown) {
      console.error(err);
      setError('PDF 파일을 읽는 중 오류가 발생했습니다.');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // Start conversion
  const handleStartConversion = async () => {
    if (!pdfDoc || !metadata) return;

    try {
      setConverting(true);
      setError(null);

      const targetPages = computeSelectedPages(metadata.numPages);
      if (targetPages.length === 0) {
        setError('변환할 페이지를 1개 이상 지정해주세요.');
        setConverting(false);
        return;
      }

      const results = await convertPDFPagesToImages(pdfDoc, targetPages, {
        dpi,
        format,
        quality,
        onProgress: (current, total, text) => {
          setProgress({ current, total, text });
        },
      });

      setConvertedPages(results);
      // Select all converted pages by default
      setSelectedPageNumbers(new Set(results.map((p) => p.pageNumber)));
    } catch (err: unknown) {
      console.error(err);
      setError('변환 중 문제가 발생했습니다. 고해상도 변환 시 브라우저 메모리가 부족할 수 있습니다.');
    } finally {
      setConverting(false);
    }
  };

  // Toggle single page selection checkbox
  const togglePageSelection = (pageNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPageNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }
      return next;
    });
  };

  // Toggle all pages selection
  const handleToggleSelectAll = () => {
    if (selectedPageNumbers.size === convertedPages.length) {
      setSelectedPageNumbers(new Set());
    } else {
      setSelectedPageNumbers(new Set(convertedPages.map((p) => p.pageNumber)));
    }
  };

  // Download single image
  const handleDownloadSingle = (page: ConvertedPage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const link = document.createElement('a');
    const baseName = metadata?.fileName.replace(/\.pdf$/i, '') || 'converted';
    link.download = `${baseName}_page_${page.pageNumber}.${format}`;
    link.href = page.dataUrl;
    link.click();
  };

  // Batch download selected images individually
  const handleBatchDownloadIndividual = async () => {
    const targetPages = convertedPages.filter((p) => selectedPageNumbers.has(p.pageNumber));
    if (targetPages.length === 0) {
      alert('다운로드할 이미지를 1개 이상 선택해주세요.');
      return;
    }

    const baseName = metadata?.fileName.replace(/\.pdf$/i, '') || 'converted';
    for (let i = 0; i < targetPages.length; i++) {
      const page = targetPages[i];
      const link = document.createElement('a');
      link.download = `${baseName}_page_${page.pageNumber}.${format}`;
      link.href = page.dataUrl;
      link.click();
      // Short delay between browser downloads to prevent throttling
      await new Promise((res) => setTimeout(res, 200));
    }
  };

  // Download selected as ZIP
  const handleDownloadSelectedZip = async () => {
    const targetPages = convertedPages.filter((p) => selectedPageNumbers.has(p.pageNumber));
    if (targetPages.length === 0) {
      alert('다운로드할 이미지를 1개 이상 선택해주세요.');
      return;
    }

    try {
      const zip = new JSZip();
      const folderName = metadata?.fileName.replace(/\.pdf$/i, '') || 'pdf_images';
      const folder = zip.folder(folderName) || zip;

      targetPages.forEach((page) => {
        const filename = `page_${String(page.pageNumber).padStart(3, '0')}.${format}`;
        folder.file(filename, page.blob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${folderName}_selected_images.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('ZIP 생성 실패:', err);
      setError('ZIP 압축 파일 생성 중 오류가 발생했습니다.');
    }
  };

  // Copy to clipboard
  const handleCopyToClipboard = async (page: ConvertedPage, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        let copyBlob = page.blob;
        if (page.blob.type !== 'image/png') {
          const img = new Image();
          img.src = page.dataUrl;
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
        setCopyFeedback(page.pageNumber);
        setTimeout(() => setCopyFeedback(null), 2000);
      } else {
        alert('이 브라우저는 클립보드 이미지 복사를 지원하지 않습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('클립보드 복사 권한이 없거나 지원되지 않는 브라우저입니다.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full space-y-4 pb-8">
      {/* Upload Zone (shown when no file is loaded) */}
      {!metadata && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative group cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 ${
              isDragging
                ? 'border-indigo-400 bg-indigo-950/30 scale-[1.01]'
                : 'border-slate-700/80 bg-slate-900/50 hover:border-indigo-500/50 hover:bg-slate-900/80'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileProcess(e.target.files[0]);
                }
              }}
              accept=".pdf,application/pdf"
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  PDF 파일을 여기에 끌어다 놓으세요
                </h3>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">
                  또는 클릭하여 파일 찾기
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 flex items-start gap-3 text-xs sm:text-sm">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-300">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File Loaded: Left/Right Compact Layout for File Info & Options */}
      {metadata && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* LEFT: File Info Card + Main Action Button (lg:col-span-5) */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-white text-sm truncate" title={metadata.fileName}>
                    {metadata.fileName}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{metadata.numPages}페이지</span>
                    <span>•</span>
                    <span>{formatFileSize(metadata.fileSize)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setPdfDoc(null);
                  setMetadata(null);
                  setConvertedPages([]);
                  setFile(null);
                  setSelectedPageNumbers(new Set());
                }}
                className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex-shrink-0 cursor-pointer"
              >
                다른 파일
              </button>
            </div>

            {/* Big Convert Button */}
            <button
              onClick={handleStartConversion}
              disabled={converting}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-md shadow-indigo-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {converting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>변환 중 ({progress.current}/{progress.total})...</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4" />
                  <span>이미지로 변환하기</span>
                </>
              )}
            </button>
          </div>

          {/* RIGHT: Compact Conversion Options Panel (lg:col-span-7) */}
          <div className="lg:col-span-7 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. DPI (300 Default) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  DPI 해상도
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { val: 300, label: '300 DPI' },
                    { val: 150, label: '150 DPI' },
                    { val: 72, label: '72 DPI' },
                    { val: 600, label: '600 DPI' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setDpi(item.val)}
                      className={`py-1 px-1.5 text-center rounded-lg border text-xs font-medium transition cursor-pointer ${
                        dpi === item.val
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-semibold shadow-sm'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Format & Quality */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  포맷
                </label>
                <div className="flex gap-1.5">
                  {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`flex-1 py-1 text-center text-xs font-semibold uppercase rounded-lg border transition cursor-pointer ${
                        format === fmt
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                {format !== 'png' && (
                  <div className="pt-0.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>품질 {Math.round(quality * 100)}%</span>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.05"
                      value={quality}
                      onChange={(e) => setQuality(parseFloat(e.target.value))}
                      className="w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* 3. Page Range */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  페이지 범위
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPageSelection('all')}
                    className={`flex-1 py-1 text-xs font-medium rounded-lg border transition cursor-pointer ${
                      pageSelection === 'all'
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-semibold'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    전체 ({metadata.numPages}p)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageSelection('custom')}
                    className={`flex-1 py-1 text-xs font-medium rounded-lg border transition cursor-pointer ${
                      pageSelection === 'custom'
                        ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-semibold'
                        : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                    }`}
                  >
                    범위 지정
                  </button>
                </div>
                {pageSelection === 'custom' && (
                  <input
                    type="text"
                    placeholder="예: 1-3, 5"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                    className="w-full text-xs px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar during conversion */}
      {converting && (
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {progress.text || '페이지 렌더링 중...'}
            </span>
            <span className="text-slate-400 font-mono">
              {Math.round((progress.current / Math.max(1, progress.total)) * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-200"
              style={{
                width: `${(progress.current / Math.max(1, progress.total)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Converted Results Section: 50% Smaller Compact Gallery with Overlays & Batch Actions */}
      {convertedPages.length > 0 && (
        <div className="space-y-3 pt-2">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                변환 완료 ({convertedPages.length}개)
              </h3>
              <span className="text-xs text-slate-400">
                선택됨: <strong className="text-indigo-400">{selectedPageNumbers.size}</strong>개
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Select All Toggle */}
              <button
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
              >
                {selectedPageNumbers.size === convertedPages.length ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                    <span>선택 해제</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>전체 선택</span>
                  </>
                )}
              </button>

              {/* Batch Individual Download */}
              <button
                onClick={handleBatchDownloadIndividual}
                disabled={selectedPageNumbers.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="선택된 이미지들을 각각 개별 파일로 다운로드"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>선택 개별 다운로드 ({selectedPageNumbers.size})</span>
              </button>

              {/* Batch ZIP Download */}
              <button
                onClick={handleDownloadSelectedZip}
                disabled={selectedPageNumbers.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="선택된 이미지들을 하나의 ZIP 파일로 압축 다운로드"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>선택 ZIP 다운로드</span>
              </button>
            </div>
          </div>

          {/* 50% Smaller Compact Image Grid (cols-2 to cols-8) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
            {convertedPages.map((page) => {
              const isSelected = selectedPageNumbers.has(page.pageNumber);
              return (
                <div
                  key={page.pageNumber}
                  onClick={() => {
                    setActiveModalPage(page);
                    setModalRotation(0);
                  }}
                  className={`group relative rounded-xl bg-slate-900 border overflow-hidden flex flex-col transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-[3/4] bg-slate-950/90 overflow-hidden flex items-center justify-center p-1.5">
                    <img
                      src={page.dataUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
                    />

                    {/* Top-Left: Checkbox Overlay */}
                    <div
                      onClick={(e) => togglePageSelection(page.pageNumber, e)}
                      className="absolute top-1.5 left-1.5 z-10 p-0.5 rounded cursor-pointer transition-transform hover:scale-110"
                      title={isSelected ? '선택 해제' : '선택'}
                    >
                      {isSelected ? (
                        <div className="w-5 h-5 rounded bg-indigo-600 text-white flex items-center justify-center shadow-md border border-indigo-400">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded bg-slate-900/80 border border-slate-600 hover:border-white shadow-md flex items-center justify-center" />
                      )}
                    </div>

                    {/* Top-Right: Page Badge */}
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-950/80 text-slate-300 border border-slate-700/80 pointer-events-none">
                      P.{page.pageNumber}
                    </span>

                    {/* Bottom Overlay: Dimensions, File Size, Save & Copy Buttons */}
                    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-1.5 pt-4 flex flex-col gap-1">
                      {/* Size & Dimension info */}
                      <div className="flex items-center justify-between text-[9px] text-slate-300 font-mono px-0.5">
                        <span>{page.width}×{page.height}</span>
                        <span>{formatFileSize(page.fileSize)}</span>
                      </div>

                      {/* Action buttons (Save & Copy) */}
                      <div className="flex gap-1 pt-0.5">
                        <button
                          onClick={(e) => handleDownloadSingle(page, e)}
                          className="flex-1 py-1 rounded bg-indigo-600/80 hover:bg-indigo-600 text-white text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                          title="이 페이지만 저장"
                        >
                          <Download className="w-3 h-3" />
                          <span>저장</span>
                        </button>

                        <button
                          onClick={(e) => handleCopyToClipboard(page, e)}
                          className="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                          title="클립보드로 복사"
                        >
                          {copyFeedback === page.pageNumber ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">복사됨</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>복사</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox / Preview Zoom Modal */}
      {activeModalPage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <h4 className="font-bold text-white text-xs sm:text-sm">
                  {metadata?.fileName} - {activeModalPage.pageNumber}페이지 미리보기
                </h4>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                  {activeModalPage.width} × {activeModalPage.height} px ({formatFileSize(activeModalPage.fileSize)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalRotation((prev) => (prev + 90) % 360)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition cursor-pointer"
                  title="90도 회전"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>회전</span>
                </button>
                <button
                  onClick={() => handleDownloadSingle(activeModalPage)}
                  className="p-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center gap-1 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>다운로드</span>
                </button>
                <button
                  onClick={() => setActiveModalPage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image viewer body */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/90">
              <img
                src={activeModalPage.dataUrl}
                alt="Enlarged preview"
                className="max-h-[70vh] object-contain transition-transform duration-200"
                style={{ transform: `rotate(${modalRotation}deg)` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
