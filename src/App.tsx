import React, { useState } from 'react';
import {
  FileImage,
  Timer,
  Shield,
  Layers,
  Sparkles,
  ExternalLink,
  Github,
  Headphones,
  CheckCircle2,
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

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Sticky Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#090d16]/85 backdrop-blur-md border-b border-slate-800/80">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                OmniTools
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {isLocalFile ? 'Offline Edition' : 'Serverless'}
                </span>
              </span>
            </div>
          </div>

          {/* Center Tabs: 'PDF to Image', 'Image Merge', (Music Timer on Web only) */}
          <nav className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800">
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
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isLocalFile ? 'bg-cyan-400' : 'bg-emerald-400'} animate-pulse`} />
            <span>{isLocalFile ? '100% Offline' : 'Client Ready'}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area: Keep tabs mounted */}
      <main className="flex-1 w-full px-3 sm:px-6 lg:px-8 py-5">
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
      <footer className="border-t border-slate-800/60 bg-slate-950/40 text-slate-500 text-xs py-5">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>서버리스 보안 설계: 모든 파일 처리는 사용자 브라우저 내부에서만 안전하게 이루어집니다.</span>
          </div>
          <div className="text-slate-400 text-right">
            Created by <strong className="font-semibold text-slate-300">NYEONGEON HANN</strong>
          </div>
        </div>
      </footer>
    </div>
  );
}
