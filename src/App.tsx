import React, { useState } from 'react';
import {
  FileImage,
  Timer,
  Shield,
  Layers,
  SplitSquareHorizontal,
  FileSpreadsheet
} from 'lucide-react';
import { PdfToImageView } from './components/PdfToImageView';
import { MusicTimerView } from './components/MusicTimerView';
import { ImageMergeView } from './components/ImageMergeView';
import { ExcelMergeView } from './components/ExcelMergeView';

export default function App() {
  const isLocalFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const [activeTab, setActiveTab] = useState<'pdf' | 'merge' | 'excel' | 'music'>('pdf');

  const tabNames: Record<string, string> = {
    pdf: 'PDF to Image',
    merge: 'Image Merge',
    excel: 'Excel Merge',
    music: 'Music Timer',
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Sticky Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#090d16]/90 backdrop-blur-md border-b border-slate-800/80">
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
                  {isLocalFile ? 'Offline' : 'Serverless'}
                </span>
              </div>
              {/* Mobile current tab indicator */}
              <p className="text-[10px] text-slate-400 truncate md:hidden">
                {tabNames[activeTab]}
              </p>
            </div>
          </div>

          {/* Desktop Center Tabs (hidden on mobile, visible on md+) */}
          <nav className="hidden md:flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setActiveTab('pdf')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                activeTab === 'pdf'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileImage className="w-4 h-4" />
              <span>PDF to Image</span>
            </button>

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

          {/* Right Status Badge */}
          <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
            <span className={`w-2 h-2 rounded-full ${isLocalFile ? 'bg-cyan-400' : 'bg-emerald-400'} animate-pulse`} />
            <span className="text-[11px] sm:text-xs">{isLocalFile ? 'Offline' : 'Client Ready'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area: Keep tabs mounted, extra bottom padding on mobile for bottom tab bar */}
      <main className="flex-1 w-full px-2.5 sm:px-6 lg:px-8 py-3.5 sm:py-6 pb-24 md:pb-8">
        <div className={activeTab === 'pdf' ? 'block' : 'hidden'}>
          <PdfToImageView />
        </div>
        <div className={activeTab === 'merge' ? 'block' : 'hidden'}>
          <ImageMergeView />
        </div>
        <div className={activeTab === 'excel' ? 'block' : 'hidden'}>
          <ExcelMergeView />
        </div>
        {!isLocalFile && (
          <div className={activeTab === 'music' ? 'block' : 'hidden'}>
            <MusicTimerView />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950/40 text-slate-500 text-xs py-4 sm:py-5 mb-16 md:mb-0">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2 text-xs">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>서버리스 보안 설계: 모든 파일 처리는 브라우저 내부에서만 안전하게 이루어집니다.</span>
          </div>
          <div className="text-slate-400 text-xs">
            Created by <strong className="font-semibold text-slate-300">NYEONGEON HANN</strong>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* Mobile Bottom Navigation Bar (Visible only on mobile screens < md)        */}
      {/* ========================================================================= */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#090d16]/95 backdrop-blur-xl border-t border-slate-800/90 shadow-[0_-8px_24px_rgba(0,0,0,0.5)] px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-4 gap-1 items-center max-w-md mx-auto">
          {/* Tab 1: PDF */}
          <button
            onClick={() => setActiveTab('pdf')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'pdf'
                ? 'text-indigo-400 font-bold bg-indigo-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileImage className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight">PDF 변환</span>
          </button>

          {/* Tab 2: Merge */}
          <button
            onClick={() => setActiveTab('merge')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'merge'
                ? 'text-indigo-400 font-bold bg-indigo-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SplitSquareHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight">이미지 병합</span>
          </button>

          {/* Tab 3: Excel */}
          <button
            onClick={() => setActiveTab('excel')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
              activeTab === 'excel'
                ? 'text-emerald-400 font-bold bg-emerald-500/15'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-tight">엑셀 머지</span>
          </button>

          {/* Tab 4: Music Timer */}
          {!isLocalFile ? (
            <button
              onClick={() => setActiveTab('music')}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition cursor-pointer ${
                activeTab === 'music'
                  ? 'text-indigo-400 font-bold bg-indigo-500/15'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Timer className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] leading-tight">음악 타이머</span>
            </button>
          ) : (
            <div className="flex flex-col items-center justify-center py-1 px-1 opacity-30">
              <Timer className="w-5 h-5 mb-0.5 text-slate-600" />
              <span className="text-[10px] leading-tight text-slate-600">웹 전용</span>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
