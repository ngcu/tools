import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  Download,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  ZoomIn,
  RotateCw,
  X,
  FileArchive,
  RefreshCw,
  CheckSquare,
  Square,
  ArrowDownToLine,
  Check,
  Trash2
} from 'lucide-react';
import JSZip from 'jszip';
import {
  loadPDFDocument,
  convertPDFPagesToImages,
  ConvertedPage,
  PDFMetadata
} from '../utils/pdfConverter';
import * as pdfjsLib from 'pdfjs-dist';

export const FileToImageView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [metadata, setMetadata] = useState<{ fileName: string; fileSize: number; numPages: number } | null>(null);

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

  // Selected images for batch export
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<Set<number>>(new Set());

  // Preview Modal
  const [activeModalPage, setActiveModalPage] = useState<ConvertedPage | null>(null);
  const [modalRotation, setModalRotation] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute pages to convert for PDF
  const computeSelectedPages = (numPages: number): number[] => {
    if (pageSelection === 'all') {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }
    const pages = new Set<number>();
    const parts = customRange.split(',').map((p) => p.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.max(1, Math.min(start, end));
          const max = Math.min(numPages, Math.max(start, end));
          for (let i = min; i <= max; i++) pages.add(i);
        }
      } else {
        const pageNum = parseInt(part, 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
          pages.add(pageNum);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  };

  // Clear loaded PDF file (Delete file & reset)
  const handleClearFile = () => {
    setFile(null);
    setPdfDoc(null);
    setFileBuffer(null);
    setMetadata(null);
    setConvertedPages([]);
    setSelectedPageNumbers(new Set());
    setError(null);
    setProgress({ current: 0, total: 0, text: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle incoming PDF file
  const handleFileProcess = async (selectedFile: File) => {
    setError(null);
    setConvertedPages([]);
    setSelectedPageNumbers(new Set());

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF(.pdf) 파일만 업로드할 수 있습니다.');
      return;
    }

    try {
      setFile(selectedFile);
      const buffer = await selectedFile.arrayBuffer();
      setFileBuffer(buffer);
      const loadedPdf = await loadPDFDocument(buffer);
      setPdfDoc(loadedPdf);
      setMetadata({
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        numPages: loadedPdf.numPages
      });
    } catch (err) {
      console.error(err);
      setError('PDF 파일을 불러오는 중 오류가 발생했습니다. 암호가 걸려 있거나 손상된 파일인지 확인해주세요.');
    }
  };

  // Start PDF Conversion
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
        }
      });

      setConvertedPages(results);
      setSelectedPageNumbers(new Set(results.map((p) => p.pageNumber)));
    } catch (err: any) {
      console.error(err);
      setError(`PDF 변환 중 문제가 발생했습니다: ${err?.message || '알 수 없는 오류'}`);
    } finally {
      setConverting(false);
    }
  };

  // Selection toggles
  const togglePageSelection = (pageNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPageNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedPageNumbers.size === convertedPages.length) {
      setSelectedPageNumbers(new Set());
    } else {
      setSelectedPageNumbers(new Set(convertedPages.map((p) => p.pageNumber)));
    }
  };

  // Single Download
  const handleDownloadSingle = (page: ConvertedPage, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const link = document.createElement('a');
    const baseName = metadata?.fileName.replace(/\.[^/.]+$/, '') || 'converted';
    link.download = `${baseName}_page_${page.pageNumber}.${format}`;
    link.href = page.dataUrl;
    link.click();
  };

  // Batch Individual Download
  const handleBatchDownloadIndividual = async () => {
    const targetPages = convertedPages.filter((p) => selectedPageNumbers.has(p.pageNumber));
    if (targetPages.length === 0) {
      alert('다운로드할 이미지를 1개 이상 선택해주세요.');
      return;
    }

    for (let i = 0; i < targetPages.length; i++) {
      handleDownloadSingle(targetPages[i]);
      if (i < targetPages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  };

  // Batch ZIP Download
  const handleDownloadSelectedZip = async () => {
    const targetPages = convertedPages.filter((p) => selectedPageNumbers.has(p.pageNumber));
    if (targetPages.length === 0) {
      alert('다운로드할 이미지를 1개 이상 선택해주세요.');
      return;
    }

    try {
      const zip = new JSZip();
      const baseName = metadata?.fileName.replace(/\.[^/.]+$/, '') || 'converted_images';

      targetPages.forEach((page) => {
        const fileName = `${baseName}_page_${String(page.pageNumber).padStart(3, '0')}.${format}`;
        zip.file(fileName, page.blob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.download = `${baseName}_images.zip`;
      link.href = URL.createObjectURL(zipBlob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      alert('ZIP 파일 생성 중 문제가 발생했습니다.');
    }
  };

  // Copy to Clipboard
  const handleCopySingleImage = async (page: ConvertedPage, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const item = new ClipboardItem({ [page.blob.type]: page.blob });
      await navigator.clipboard.write([item]);
      setCopyFeedback(page.pageNumber);
      setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      alert('클립보드 이미지 복사를 지원하지 않는 브라우저입니다.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full space-y-4">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileProcess(e.target.files[0]);
          }
        }}
        accept=".pdf"
        className="hidden"
      />

      {/* Top Action Bar - Only when file is loaded */}
      {file && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-2 truncate">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">{file.name}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>다른 PDF 열기</span>
            </button>
            <button
              onClick={handleClearFile}
              className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-xs font-semibold text-red-300 border border-red-500/30 transition flex items-center gap-1.5 cursor-pointer"
              title="현재 PDF 파일을 닫고 새 파일 업로드 대기 화면으로 전환"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>파일 삭제</span>
            </button>
          </div>
        </div>
      )}

      {/* Zero State Upload Area */}
      {!file && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileProcess(e.dataTransfer.files[0]);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-6 sm:p-10 w-full h-[calc(100vh-125px)] md:h-[calc(100vh-72px)] min-h-[420px] flex items-center justify-center text-center cursor-pointer transition-all duration-300 group ${
            isDragging
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
                PDF 파일을 끌어다 놓으세요
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                클릭하여 PDF 파일을 선택하거나 이곳으로 드래그 앤 드롭하세요
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-slate-400">
              <span className="px-2.5 py-1 rounded-md bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 font-semibold">.PDF 전용</span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700">300 DPI 초고화질</span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700">페이지별 개별 / ZIP 일괄 저장</span>
              <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700">클립보드 즉시 복사</span>
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

      {/* File Loaded Options & Action Card */}
      {metadata && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* LEFT: File Info Card */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-500/10 text-red-400 border border-red-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-white text-sm truncate" title={metadata.fileName}>
                    {metadata.fileName}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="uppercase font-bold text-red-400">PDF</span>
                    <span>•</span>
                    <span>{metadata.numPages}페이지</span>
                    <span>•</span>
                    <span>{formatFileSize(metadata.fileSize)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleClearFile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                title="파일 삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleStartConversion}
              disabled={converting}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white shadow-md shadow-indigo-500/25 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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

          {/* RIGHT: Format & Resolution Panel */}
          <div className="lg:col-span-7 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex flex-col justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* DPI Setting */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  해상도 설정
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
                          ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300 font-semibold'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Select */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  출력 포맷
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {converting && (
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {progress.text || '렌더링 중...'}
            </span>
            <span className="text-slate-400 font-mono">
              {Math.round((progress.current / Math.max(1, progress.total)) * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-200"
              style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Converted Results Section */}
      {convertedPages.length > 0 && (
        <div className="space-y-3 pt-2">
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

              <button
                onClick={handleBatchDownloadIndividual}
                disabled={selectedPageNumbers.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-40 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>선택 개별 다운로드 ({selectedPageNumbers.size})</span>
              </button>

              <button
                onClick={handleDownloadSelectedZip}
                disabled={selectedPageNumbers.size === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>선택 ZIP 다운로드</span>
              </button>
            </div>
          </div>

          {/* Grid Gallery */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {convertedPages.map((page) => {
              const isSelected = selectedPageNumbers.has(page.pageNumber);
              return (
                <div
                  key={page.pageNumber}
                  onClick={(e) => togglePageSelection(page.pageNumber, e)}
                  className={`group relative rounded-xl border bg-slate-950/80 overflow-hidden transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-500/10'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="relative aspect-[3/4] bg-slate-900/60 flex items-center justify-center overflow-hidden">
                    <img
                      src={page.dataUrl}
                      alt={`Page ${page.pageNumber}`}
                      className="max-h-full max-w-full object-contain pointer-events-none"
                    />

                    {/* Top Checkbox */}
                    <div className="absolute top-1.5 left-1.5 z-10">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center transition shadow ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-900/80 border border-slate-600 text-transparent hover:border-white'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    </div>

                    {/* Hover Overlay Action Bar */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveModalPage(page);
                          setModalRotation(0);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-indigo-600 text-white transition shadow cursor-pointer"
                        title="크게 보기"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleCopySingleImage(page, e)}
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-indigo-600 text-white transition shadow cursor-pointer"
                        title="클립보드로 복사"
                      >
                        {copyFeedback === page.pageNumber ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleDownloadSingle(page, e)}
                        className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-emerald-600 text-white transition shadow cursor-pointer"
                        title="다운로드"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Footer Info */}
                  <div className="p-1.5 px-2 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-white">#{page.pageNumber}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {page.width}×{page.height}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Zoom Preview Modal */}
      {activeModalPage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setActiveModalPage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center">
            <img
              src={activeModalPage.dataUrl}
              alt="Zoomed"
              style={{ transform: `rotate(${modalRotation}deg)` }}
              className="max-h-[80vh] max-w-full object-contain rounded shadow-2xl transition-transform duration-200"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-3 flex items-center gap-3 bg-slate-900/90 px-4 py-2 rounded-full border border-slate-700 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs text-white font-semibold">페이지 #{activeModalPage.pageNumber}</span>
              <button
                onClick={() => setModalRotation((prev) => (prev + 90) % 360)}
                className="p-1.5 hover:text-indigo-400 transition cursor-pointer"
                title="90도 회전"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDownloadSingle(activeModalPage)}
                className="p-1.5 hover:text-emerald-400 transition cursor-pointer"
                title="다운로드"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveModalPage(null)}
                className="p-1.5 hover:text-red-400 transition cursor-pointer"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
