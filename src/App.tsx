import React, { useState } from 'react';
import {
  Wand2,
  FileText,
  Timer,
  Layers,
  SplitSquareHorizontal,
  FileSpreadsheet,
  Download,
  Check
} from 'lucide-react';
import { ImageEditView } from './components/ImageEditView';
import { FileToImageView } from './components/FileToImageView';
import { MusicTimerView } from './components/MusicTimerView';
import { ImageMergeView } from './components/ImageMergeView';
import { ExcelMergeView } from './components/ExcelMergeView';

export default function App() {
  const isLocalFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const [activeTab, setActiveTab] = useState<'edit' | 'file-to-image' | 'merge' | 'excel' | 'music'>('edit');
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  const tabNames: Record<string, string> = {
    edit: 'Image Edit (이미지 편집)',
    'file-to-image': 'PDF to Image (PDF 변환)',
    merge: 'Image Merge (이미지 병합)',
    excel: 'Excel Merge (엑셀 머지)',
    music: 'Music Timer (음악 타이머)',
  };

  // One-click Offline HTML Downloader
  const handleDownloadOfflineHtml = async () => {
    try {
      // 1. Try fetching the dedicated standalone OmniTools_Offline.html from server/hosting
      const resp = await fetch('./OmniTools_Offline.html');
      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'OmniTools_Offline.html';
        a.click();
        URL.revokeObjectURL(url);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 2500);
        return;
      }
    } catch {
      // fallback below
    }

    // 2. Fallback: Save current rendered document as standalone singlefile HTML
    try {
      const htmlContent = '<!doctype html>\n' + document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'OmniTools_Offline.html';
      a.click();
      URL.revokeObjectURL(url);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch {
      alert('오프라인 파일 다운로드에 실패했습니다.');
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#090d16] text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Navigation Bar */}
      <header className="shrink-0 z-40 bg-[#090d16]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="w-full px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                  OmniTools
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 whitespace-nowrap">
                  {isLocalFile ? 'Offline Edition' : 'Serverless'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate md:hidden">
                {tabNames[activeTab]}
              </p>
            </div>
          </div>

          {/* Desktop Center Tabs */}
          <nav className="hidden md:flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
            {/* 1. Image Edit */}
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'edit'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              <span>Image Edit</span>
            </button>

            {/* 2. PDF to Image */}
            <button
              onClick={() => setActiveTab('file-to-image')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'file-to-image'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>PDF to Image</span>
            </button>

            {/* 3. Image Merge */}
            <button
              onClick={() => setActiveTab('merge')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'merge'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <SplitSquareHorizontal className="w-4 h-4" />
              <span>Image Merge</span>
            </button>

            {/* 4. Excel Merge */}
            <button
              onClick={() => setActiveTab('excel')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'excel'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel Merge</span>
            </button>

            {/* 5. Music Timer */}
            {!isLocalFile && (
              <button
                onClick={() => setActiveTab('music')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  activeTab === 'music'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Timer className="w-4 h-4" />
                <span>Music Timer</span>
              </button>
            )}
          </nav>

          {/* Right Area: Offline HTML Download Button & Status Badge */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Top-Right Dedicated Offline HTML Download Button */}
            <button
              onClick={handleDownloadOfflineHtml}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer ${
                downloadSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/25 border border-emerald-400/40'
              }`}
              title="인터넷 없이 평생 사용할 수 있는 단일 HTML 파일로 다운로드"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span className="hidden sm:inline">다운로드 완료!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Offline HTML 다운로드</span>
                  <span className="sm:hidden">Offline HTML</span>
                </>
              )}
            </button>

            {/* Status indicator */}
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400">
              <span className={`w-2 h-2 rounded-full ${isLocalFile ? 'bg-cyan-400' : 'bg-emerald-400'} animate-pulse`} />
              <span className="text-[11px] font-mono">{isLocalFile ? '100% Offline' : 'Ready'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto w-full px-2.5 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 pb-20 md:pb-3">
        {/* 1. Image Edit View */}
        <div className={activeTab === 'edit' ? 'block' : 'hidden'}>
          <ImageEditView />
        </div>

        {/* 2. File to Image View (PDF) */}
        <div className={activeTab === 'file-to-image' ? 'block' : 'hidden'}>
          <FileToImageView />
        </div>

        {/* 3. Image Merge View */}
        <div className={activeTab === 'merge' ? 'block' : 'hidden'}>
          <ImageMergeView />
        </div>

        {/* 4. Excel Merge View */}
        <div className={activeTab === 'excel' ? 'block' : 'hidden'}>
          <ExcelMergeView />
        </div>

        {/* 5. Music Timer View */}
        {!isLocalFile && (
          <div className={activeTab === 'music' ? 'block' : 'hidden'}>
            <MusicTimerView />
          </div>
        )}
      </main>

      {/* Floating Pill Badge: Created by NYEONGEON HANN */}
      <div className="fixed bottom-14 md:bottom-3 right-3 z-40 pointer-events-auto select-none">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-[11px] text-slate-300 shadow-xl backdrop-blur-md font-medium tracking-tight transition cursor-default">
          <span className="text-slate-400">Created by</span>
          <span className="font-bold text-slate-100">NYEONGEON HANN</span>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#090d16]/95 backdrop-blur-xl border-t border-slate-800/90 shadow-[0_-8px_24px_rgba(0,0,0,0.5)] px-1.5 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className={`grid ${!isLocalFile ? 'grid-cols-5' : 'grid-cols-4'} gap-1 items-center max-w-lg mx-auto`}>
          {/* Tab 1: Image Edit */}
          <button
            onClick={() => setActiveTab('edit')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'edit'
                ? 'text-indigo-400 font-bold bg-indigo-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
            <span className="text-[9px] sm:text-[10px] leading-tight">편집</span>
          </button>

          {/* Tab 2: File to Image */}
          <button
            onClick={() => setActiveTab('file-to-image')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'file-to-image'
                ? 'text-indigo-400 font-bold bg-indigo-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
            <span className="text-[9px] sm:text-[10px] leading-tight">문서변환</span>
          </button>

          {/* Tab 3: Merge */}
          <button
            onClick={() => setActiveTab('merge')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'merge'
                ? 'text-indigo-400 font-bold bg-indigo-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SplitSquareHorizontal className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
            <span className="text-[9px] sm:text-[10px] leading-tight">이미지 병합</span>
          </button>

          {/* Tab 4: Excel */}
          <button
            onClick={() => setActiveTab('excel')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'excel'
                ? 'text-emerald-400 font-bold bg-emerald-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
            <span className="text-[9px] sm:text-[10px] leading-tight">엑셀 머지</span>
          </button>

          {/* Tab 5: Music Timer */}
          {!isLocalFile && (
            <button
              onClick={() => setActiveTab('music')}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
                activeTab === 'music'
                  ? 'text-indigo-400 font-bold bg-indigo-500/15'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Timer className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
              <span className="text-[9px] sm:text-[10px] leading-tight">음악 타이머</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
