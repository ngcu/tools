import React, { useState, useRef, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle2,
  FileText,
  Search,
  Settings2,
  RefreshCw,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
  TableProperties
} from 'lucide-react';
import {
  parseFile,
  mergeFilesData,
  exportToXLSX,
  exportToCSV,
  ParsedFileInfo,
  MergeOptions
} from '../utils/excelMerge';

export const ExcelMergeView: React.FC = () => {
  const [files, setFiles] = useState<ParsedFileInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Merge Options
  const [includeFileName, setIncludeFileName] = useState<boolean>(true);
  const [fileNameHeader, setFileNameHeader] = useState<string>('파일명');
  const [skipEmptyRows, setSkipEmptyRows] = useState<boolean>(true);

  // Preview Pagination & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file uploads
  const handleUploadFiles = async (uploadedFiles: FileList | File[]) => {
    const validExtensions = ['xlsx', 'xlsb', 'xlsm', 'xls', 'csv'];
    const fileArray = Array.from(uploadedFiles);

    const validFiles = fileArray.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ext && validExtensions.includes(ext);
    });

    if (validFiles.length === 0) {
      setErrorMessage('지원하는 엑셀(.xlsx, .xlsb, .xlsm, .xls) 또는 CSV(.csv) 파일을 선택해주세요.');
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const parsedResults: ParsedFileInfo[] = [];
      for (const file of validFiles) {
        try {
          const parsed = await parseFile(file);
          parsedResults.push(parsed);
        } catch (err) {
          console.error(`Error parsing file ${file.name}:`, err);
        }
      }

      setFiles((prev) => [...prev, ...parsedResults]);
    } catch (err: any) {
      setErrorMessage(`파일 분석 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Re-encode a CSV file if user changes encoding manually
  const handleEncodingChange = async (fileId: string, newEncoding: 'utf-8' | 'euc-kr') => {
    setIsProcessing(true);
    try {
      const targetFile = files.find((f) => f.id === fileId);
      if (!targetFile) return;

      const updatedParsed = await parseFile(targetFile.fileObj, newEncoding);
      setFiles((prev) => prev.map((f) => (f.id === fileId ? updatedParsed : f)));
    } catch (err: any) {
      setErrorMessage(`인코딩 변경 실패: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Move file up / down
  const moveFile = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;

    setFiles((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  // Remove file
  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Reset all
  const handleReset = () => {
    setFiles([]);
    setErrorMessage(null);
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Merge computed result
  const mergeOptions: MergeOptions = useMemo(
    () => ({
      includeFileNameColumn: includeFileName,
      fileNameColumnHeader: fileNameHeader.trim() || '파일명',
      skipEmptyRows,
    }),
    [includeFileName, fileNameHeader, skipEmptyRows]
  );

  const mergeResult = useMemo(() => {
    return mergeFilesData(files, mergeOptions);
  }, [files, mergeOptions]);

  // Filtered rows for preview
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return mergeResult.mergedRows;
    const query = searchQuery.toLowerCase().trim();
    return mergeResult.mergedRows.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(query))
    );
  }, [mergeResult.mergedRows, searchQuery]);

  // Paginated rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Export handlers
  const handleDownloadXLSX = () => {
    if (mergeResult.mergedRows.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    exportToXLSX(mergeResult.mergedHeaders, mergeResult.mergedRows, `Merged_Excel_${timestamp}.xlsx`);
  };

  const handleDownloadCSV = () => {
    if (mergeResult.mergedRows.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    exportToCSV(mergeResult.mergedHeaders, mergeResult.mergedRows, `Merged_Excel_${timestamp}.csv`);
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Introduction */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-indigo-950/30 border border-emerald-500/20 shadow-xl backdrop-blur-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Excel & CSV Merge
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
                100% Client-Side
              </span>
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            여러 개의 엑셀(<span className="text-emerald-300 font-mono">xlsx, xlsb, xlsm, xls</span>) 및 CSV 파일을
            첫 번째 파일의 컬럼(헤더)을 기준으로 빠르고 안전하게 병합합니다. 동일 컬럼이 없는 파일의 셀은 자동으로 비워집니다.
          </p>
        </div>

        {files.length > 0 && (
          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>전체 초기화</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              disabled={mergeResult.mergedRows.length === 0}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-emerald-300 border border-emerald-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="한글이 안 깨지는 UTF-8 BOM CSV 다운로드"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV 저장</span>
            </button>

            <button
              onClick={handleDownloadXLSX}
              disabled={mergeResult.mergedRows.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/25"
            >
              <Download className="w-4 h-4" />
              <span>XLSX 엑셀 다운로드</span>
            </button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Upload Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center group ${
          isDragging
            ? 'border-emerald-500 bg-emerald-950/20'
            : 'border-slate-800 hover:border-emerald-500/50 bg-slate-900/40 hover:bg-slate-900/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.xlsb,.xlsm,.xls,.csv"
          onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 flex items-center justify-center transition-all group-hover:scale-105">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">
              엑셀 또는 CSV 파일을 이곳으로 끌어오거나 클릭하여 업로드
            </p>
            <p className="text-xs text-slate-400 mt-1">
              지원 포맷: <span className="text-emerald-400 font-mono">.xlsx, .xlsb, .xlsm, .xls, .csv</span> (여러 파일 동시 선택 가능)
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>CSV 인코딩(UTF-8, EUC-KR / CP949) 한글 깨짐 자동 감지</span>
          </div>
        </div>
      </div>

      {/* Main Content when files are loaded */}
      {files.length > 0 && (
        <div className="space-y-6">
          {/* File Order & Options Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Cols: File List with Order Control */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span>업로드된 파일 목록 ({files.length}개)</span>
                </h3>
                <span className="text-xs text-slate-400">
                  첫 번째 파일이 <strong className="text-emerald-400">기준 컬럼</strong>이 됩니다. 순서를 변경하여 기준 파일을 바꿀 수 있습니다.
                </span>
              </div>

              <div className="space-y-2.5">
                {files.map((file, idx) => {
                  const isBase = idx === 0;
                  const missingCols = mergeResult.stats.missingInOtherFiles[file.name] || [];

                  return (
                    <div
                      key={file.id}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isBase
                          ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Left: Info */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isBase
                              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-sm'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-[260px] sm:max-w-[340px]">
                              {file.name}
                            </span>

                            {isBase && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <TableProperties className="w-3 h-3" />
                                기준 파일 (마스터 헤더)
                              </span>
                            )}

                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {file.type}
                            </span>

                            {file.type === 'csv' && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-400">인코딩:</span>
                                <select
                                  value={file.encoding || 'utf-8'}
                                  onChange={(e) =>
                                    handleEncodingChange(file.id, e.target.value as 'utf-8' | 'euc-kr')
                                  }
                                  className="text-[10px] bg-slate-800 text-slate-200 border border-slate-700 rounded px-1 py-0.5 cursor-pointer focus:outline-none focus:border-emerald-500"
                                >
                                  <option value="utf-8">UTF-8</option>
                                  <option value="euc-kr">EUC-KR (CP949)</option>
                                </select>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                            <span>시트: <strong className="text-slate-300">{file.sheetName}</strong></span>
                            <span>•</span>
                            <span>데이터: <strong className="text-slate-300">{file.totalRows.toLocaleString()}</strong>행</span>
                            <span>•</span>
                            <span>컬럼: <strong className="text-slate-300">{file.totalCols}</strong>개</span>
                            <span>•</span>
                            <span>{formatSize(file.size)}</span>
                          </div>

                          {!isBase && missingCols.length > 0 && (
                            <div className="mt-1 text-[10px] text-amber-400/90 flex items-center gap-1">
                              <Info className="w-3 h-3 shrink-0" />
                              <span>
                                기준 컬럼 중 <strong>{missingCols.length}</strong>개 부재 (자동 빈값 처리: {missingCols.slice(0, 3).join(', ')}{missingCols.length > 3 ? ' 외' : ''})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                        <button
                          onClick={() => moveFile(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700 transition cursor-pointer"
                          title="위로 이동 (기준 파일로 올리기)"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveFile(idx, 'down')}
                          disabled={idx === files.length - 1}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700 transition cursor-pointer"
                          title="아래로 이동"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeFile(file.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 transition cursor-pointer"
                          title="파일 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 1 Col: Merge Settings & Master Schema */}
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-emerald-400" />
                  <span>머지(Merge) 옵션 설정</span>
                </h4>

                {/* Option: Prepend Source File Name Column */}
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeFileName}
                      onChange={(e) => setIncludeFileName(e.target.checked)}
                      className="accent-emerald-500 rounded w-4 h-4 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        출처 파일명 컬럼 맨 앞에 추가
                      </span>
                      <span className="text-[11px] text-slate-400">
                        어느 파일에서 온 데이터인지 구분할 수 있도록 1열에 파일명을 기록합니다.
                      </span>
                    </div>
                  </label>

                  {includeFileName && (
                    <div className="pl-6 pt-1 flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 shrink-0">컬럼명:</span>
                      <input
                        type="text"
                        value={fileNameHeader}
                        onChange={(e) => setFileNameHeader(e.target.value)}
                        placeholder="파일명"
                        className="w-28 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* Option: Skip Empty Rows */}
                <div className="pt-2 border-t border-slate-800/80">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={skipEmptyRows}
                      onChange={(e) => setSkipEmptyRows(e.target.checked)}
                      className="accent-emerald-500 rounded w-4 h-4 mt-0.5 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-semibold text-white block">
                        모든 셀이 빈 행 자동 제외
                      </span>
                      <span className="text-[11px] text-slate-400">
                        데이터가 전혀 없는 빈 줄을 병합 결과에서 제거합니다.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Master Column Schema View */}
              {files.length > 0 && files[0] && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>기준 컬럼 스키마 ({files[0].headers.length}개)</span>
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-medium truncate max-w-[140px]">
                      {files[0].name}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    첫 번째 파일에 정의된 컬럼 목록입니다. 후속 파일에 이 컬럼이 없으면 빈 값으로 저장됩니다:
                  </p>

                  <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-1 bg-slate-950/60 rounded-lg border border-slate-800/80">
                    {includeFileName && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {fileNameHeader.trim() || '파일명'} (자동 생성)
                      </span>
                    )}
                    {files[0].headers.map((h, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Merge Result & Data Table Preview */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <TableProperties className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    병합 미리보기
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      총 {mergeResult.stats.totalRows.toLocaleString()}행
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    컬럼 {mergeResult.mergedHeaders.length}개 기준
                  </span>
                </div>
              </div>

              {/* Search & Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="미리보기 데이터 검색..."
                    className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44 sm:w-56"
                  />
                </div>

                <button
                  onClick={handleDownloadCSV}
                  disabled={mergeResult.mergedRows.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-emerald-300 border border-emerald-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV 저장</span>
                </button>

                <button
                  onClick={handleDownloadXLSX}
                  disabled={mergeResult.mergedRows.length === 0}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/25"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>XLSX 다운로드</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800">
                    <th className="py-2.5 px-3 font-semibold text-slate-400 text-center w-12 border-r border-slate-800">
                      #
                    </th>
                    {mergeResult.mergedHeaders.map((header, hIdx) => {
                      const isFileCol = includeFileName && hIdx === 0;
                      return (
                        <th
                          key={hIdx}
                          className={`py-2.5 px-3 font-semibold whitespace-nowrap border-r border-slate-800 last:border-r-0 ${
                            isFileCol ? 'text-indigo-300 bg-indigo-950/20' : 'text-slate-300'
                          }`}
                        >
                          {header}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={mergeResult.mergedHeaders.length + 1}
                        className="py-10 text-center text-slate-500 text-xs"
                      >
                        {searchQuery ? '검색 결과와 일치하는 데이터가 없습니다.' : '표시할 데이터가 없습니다.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, rIdx) => {
                      const globalIndex = (currentPage - 1) * pageSize + rIdx + 1;
                      return (
                        <tr key={rIdx} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px] border-r border-slate-800">
                            {globalIndex}
                          </td>
                          {mergeResult.mergedHeaders.map((header, cIdx) => {
                            const val = row[header];
                            const isEmpty = val === null || val === undefined || String(val).trim() === '';
                            const isFileCol = includeFileName && cIdx === 0;

                            return (
                              <td
                                key={cIdx}
                                className={`py-2 px-3 whitespace-nowrap text-slate-200 border-r border-slate-800/80 last:border-r-0 max-w-[280px] truncate ${
                                  isFileCol ? 'font-mono text-indigo-300 text-[11px]' : ''
                                }`}
                              >
                                {isEmpty ? (
                                  <span className="text-slate-600 italic text-[11px]">(빈 값)</span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredRows.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span>
                    총 <strong>{filteredRows.length.toLocaleString()}</strong>개 행 중{' '}
                    <strong>{((currentPage - 1) * pageSize + 1).toLocaleString()}</strong> -{' '}
                    <strong>{Math.min(currentPage * pageSize, filteredRows.length).toLocaleString()}</strong> 표시
                  </span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <span>페이지당:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value={20}>20개</option>
                      <option value={50}>50개</option>
                      <option value={100}>100개</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-mono text-xs text-white">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
