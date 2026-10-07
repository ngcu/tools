import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  Maximize2,
  Minimize2,
  Coffee,
  Music,
  Bookmark,
  Trash2,
  Check,
  AlertTriangle,
  ExternalLink,
  Volume2,
  VolumeX,
  RefreshCw,
  Sparkles,
  Bell,
  BellOff
} from 'lucide-react';
import { playCompletionSound, playTickSound, startRepeatingAlarm, stopRepeatingAlarm } from '../utils/sound';
import { safeStorage } from '../utils/safeStorage';

interface CafeSample {
  id: string;
  title: string;
  desc: string;
  youtubeId: string;
  emoji: string;
}

// 5 Curated Music & Praise Samples (100% Embed-Safe & Tested with YouTube API)
// 1 & 2: Existing 3rd and 4th tracks moved to front
// 3, 4, 5: Beautiful CCM Praise & Worship Piano BGM tracks
const CAFE_SAMPLES: CafeSample[] = [
  {
    id: 'cafe-slow-jazz',
    title: '슬로우 재즈 피아노 라디오',
    desc: '잔잔하고 감미로운 카페 라운지 피아노 선율',
    youtubeId: 'Dx5qFachd3A',
    emoji: '🎷',
  },
  {
    id: 'cafe-terrace-bossa',
    title: '테라스 재즈 & 보사노바',
    desc: '포근하고 싱그러운 테라스 카페 재즈 선율',
    youtubeId: '5owWIKLQxzE',
    emoji: '🌿',
  },
  {
    id: 'praise-bright-ccm',
    title: '카페에서 듣는 밝은 찬양',
    desc: '은혜와 평안을 주는 편안한 CCM 피아노',
    youtubeId: '0TlQquzJXYo',
    emoji: '🕊️',
  },
  {
    id: 'praise-bossa-worship',
    title: '보사 피아노 묵상 찬양',
    desc: '잔잔하고 감미로운 워십 피아노 연주',
    youtubeId: 'OMxt57UyYRY',
    emoji: '🙏',
  },
  {
    id: 'praise-prayer-ccm',
    title: '주의 인도하심을 구하는 찬양',
    desc: '마음에 깊은 평안을 주는 기도 & 묵상 피아노',
    youtubeId: 'n6JiWNkm27g',
    emoji: '✨',
  },
];

type TimerPresetMinute = 30 | 15 | 12 | 10 | 'custom';

const STORAGE_KEYS = {
  YOUTUBE_URL: 'music_timer_youtube_url',
  YOUTUBE_TITLE: 'music_timer_youtube_title',
  YOUTUBE_ID: 'music_timer_youtube_id',
  FAVORITES: 'music_timer_favorites',
  AUTO_PLAY_ON_START: 'music_timer_auto_play_on_start',
  AUTO_PAUSE_ON_END: 'music_timer_auto_pause_on_end',
  SOUND_ENABLED: 'music_timer_sound_enabled',
  SELECTED_PRESET: 'music_timer_selected_preset_min',
};

// Known broken/restricted legacy IDs to auto-migrate
const BROKEN_LEGACY_IDS = new Set(['e3L1I7i91qU', 'vm4Y-N_Yw_U', '92bhkbB-JcQ', 'W_28Neq_mXQ', 'kgx4WGK0oNU', 'DWcJFNfaw9c', '5qap5aO4i9A']);

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const MusicTimerView: React.FC = () => {
  // 1. YouTube Link & Persistent Storage (with automatic migration of broken legacy IDs)
  const [youtubeInput, setYoutubeInput] = useState<string>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.YOUTUBE_URL);
    const savedId = safeStorage.getItem(STORAGE_KEYS.YOUTUBE_ID);
    if (!saved || (savedId && (BROKEN_LEGACY_IDS.has(savedId) || savedId === 'MYPVQccHhAQ'))) {
      return 'https://www.youtube.com/watch?v=Dx5qFachd3A';
    }
    return saved;
  });

  const [currentVideoId, setCurrentVideoId] = useState<string>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.YOUTUBE_ID);
    if (!saved || (saved && (BROKEN_LEGACY_IDS.has(saved) || saved === 'MYPVQccHhAQ'))) {
      return 'Dx5qFachd3A';
    }
    return saved;
  });

  const [currentTitle, setCurrentTitle] = useState<string>(() => {
    const savedId = safeStorage.getItem(STORAGE_KEYS.YOUTUBE_ID);
    if (!savedId || (savedId && (BROKEN_LEGACY_IDS.has(savedId) || savedId === 'MYPVQccHhAQ'))) {
      return '슬로우 재즈 피아노 라디오';
    }
    return safeStorage.getItem(STORAGE_KEYS.YOUTUBE_TITLE) || '슬로우 재즈 피아노 라디오';
  });

  const [playerState, setPlayerState] = useState<'unstarted' | 'playing' | 'paused' | 'buffering' | 'error'>('unstarted');
  const [playerError, setPlayerError] = useState<string | null>(null);

  const [savedFavorites, setSavedFavorites] = useState<{ title: string; url: string; videoId: string }[]>(() => {
    try {
      const stored = safeStorage.getItem(STORAGE_KEYS.FAVORITES);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // 2. Timer States (30m, 15m, 12m, 10m)
  const [selectedPresetMin, setSelectedPresetMin] = useState<TimerPresetMinute>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SELECTED_PRESET);
    if (saved === '15') return 15;
    if (saved === '12') return 12;
    if (saved === '10') return 10;
    return 30; // default 30m
  });

  const [totalSeconds, setTotalSeconds] = useState<number>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SELECTED_PRESET);
    if (saved === '15') return 15 * 60;
    if (saved === '12') return 12 * 60;
    if (saved === '10') return 10 * 60;
    return 30 * 60;
  });

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SELECTED_PRESET);
    if (saved === '15') return 15 * 60;
    if (saved === '12') return 12 * 60;
    if (saved === '10') return 10 * 60;
    return 30 * 60;
  });

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>('20');
  const [justFinished, setJustFinished] = useState<boolean>(false);
  const [isAlarmRinging, setIsAlarmRinging] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);

  // 3. User Options
  const [autoPlayOnStart, setAutoPlayOnStart] = useState<boolean>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.AUTO_PLAY_ON_START);
    return saved !== null ? saved === 'true' : true;
  });
  const [autoPauseOnEnd, setAutoPauseOnEnd] = useState<boolean>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.AUTO_PAUSE_ON_END);
    return saved !== null ? saved === 'true' : true;
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SOUND_ENABLED);
    return saved !== null ? saved === 'true' : true;
  });

  // YouTube Player Instance Ref
  const playerRef = useRef<any>(null);
  const containerId = 'youtube-player-container-cafe';

  // Extract Video ID helper
  const extractVideoId = (url: string): string | null => {
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/
    );
    return match ? match[1] : null;
  };

  // Safe Player Commands
  const playVideoSafely = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      try {
        playerRef.current.playVideo();
        setPlayerState('playing');
      } catch (e) {
        console.warn('playVideo error:', e);
      }
    }
  }, []);

  const pauseVideoSafely = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
      try {
        playerRef.current.pauseVideo();
        setPlayerState('paused');
      } catch (e) {
        console.warn('pauseVideo error:', e);
      }
    }
  }, []);

  // Initialize YouTube Iframe Player API
  useEffect(() => {
    let isMounted = true;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;

      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }

      setPlayerError(null);

      playerRef.current = new window.YT.Player(containerId, {
        videoId: currentVideoId,
        host: 'https://www.youtube.com',
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          enablejsapi: 1,
          modestbranding: 1,
          playsinline: 1,
          origin: typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' ? window.location.origin : undefined,
        },
        events: {
          onReady: (event: any) => {
            if (!isMounted) return;
            if (isRunning && autoPlayOnStart) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: any) => {
            if (!isMounted) return;
            const state = event.data;
            if (state === 1) {
              setPlayerState('playing');
              setPlayerError(null);
            } else if (state === 2) {
              setPlayerState('paused');
            } else if (state === 3) {
              setPlayerState('buffering');
            } else if (state === 0) {
              setPlayerState('paused');
            }
          },
          onError: (event: any) => {
            if (!isMounted) return;
            setPlayerState('error');
            const code = event.data;
            if (code === 101 || code === 150) {
              setPlayerError('해당 영상은 저작권자가 외부 사이트 재생을 제한했습니다. 좌측 카페 음악 샘플을 선택해주세요.');
            } else if (code === 100) {
              setPlayerError('동영상을 찾을 수 없습니다.');
            } else {
              setPlayerError('동영상 로딩 중 오류가 발생했습니다.');
            }
          },
        },
      });
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      initPlayer();
    }

    return () => {
      isMounted = false;
    };
  }, [currentVideoId]);

  // Persist video URL
  const persistVideoInfo = (url: string, vid: string, title: string) => {
    safeStorage.setItem(STORAGE_KEYS.YOUTUBE_URL, url);
    safeStorage.setItem(STORAGE_KEYS.YOUTUBE_ID, vid);
    safeStorage.setItem(STORAGE_KEYS.YOUTUBE_TITLE, title);
  };

  // Change video handler
  const handleApplyYoutubeUrl = (urlToApply?: string, customTitle?: string) => {
    const target = urlToApply || youtubeInput;
    const vid = extractVideoId(target);
    if (vid) {
      setPlayerError(null);
      setCurrentVideoId(vid);

      const foundSample = CAFE_SAMPLES.find((c) => c.youtubeId === vid);
      const title = customTitle || (foundSample ? foundSample.title : '유튜브 영상');
      setCurrentTitle(title);
      persistVideoInfo(target, vid, title);

      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById(vid);
        playerRef.current.playVideo();
      }
    } else {
      alert('올바른 유튜브 링크(URL)를 입력해주세요.');
    }
  };

  // Save to favorites
  const handleSaveFavorite = () => {
    if (!currentVideoId) return;
    const already = savedFavorites.some((f) => f.videoId === currentVideoId);
    if (already) return;

    const newFavs = [
      ...savedFavorites,
      {
        title: currentTitle || `유튜브 트랙 (${currentVideoId})`,
        url: `https://www.youtube.com/watch?v=${currentVideoId}`,
        videoId: currentVideoId,
      },
    ];
    setSavedFavorites(newFavs);
    safeStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavs));
  };

  const handleRemoveFavorite = (vid: string) => {
    const filtered = savedFavorites.filter((f) => f.videoId !== vid);
    setSavedFavorites(filtered);
    safeStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(filtered));
  };

  // Stop alarm sound
  const handleStopAlarm = useCallback(() => {
    stopRepeatingAlarm();
    setIsAlarmRinging(false);
    setJustFinished(false);
  }, []);

  // Preset Mode Select (30m, 15m, 12m, 10m)
  const handleSelectPreset = (minutes: 30 | 15 | 12 | 10) => {
    stopRepeatingAlarm();
    setIsAlarmRinging(false);
    setIsRunning(false);
    setSelectedPresetMin(minutes);
    setJustFinished(false);
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_PRESET, String(minutes));
    } catch {
      // ignore
    }
  };

  // Custom Minutes
  const handleCustomMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setCustomMinutesInput(valStr);
    const mins = parseInt(valStr, 10);
    if (!isNaN(mins) && mins > 0) {
      const clamped = Math.min(180, Math.max(1, mins));
      stopRepeatingAlarm();
      setIsAlarmRinging(false);
      setIsRunning(false);
      setSelectedPresetMin('custom');
      setJustFinished(false);
      const secs = clamped * 60;
      setTotalSeconds(secs);
      setRemainingSeconds(secs);
    }
  };

  const handleSetCustomMinutes = () => {
    const mins = parseInt(customMinutesInput, 10);
    if (isNaN(mins) || mins <= 0) return;
    stopRepeatingAlarm();
    setIsAlarmRinging(false);
    setIsRunning(false);
    setSelectedPresetMin('custom');
    setJustFinished(false);
    const secs = mins * 60;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
  };

  // Toggle Start / Pause
  const handleToggleTimer = () => {
    playTickSound();
    if (isAlarmRinging) {
      handleStopAlarm();
      return;
    }
    const nextState = !isRunning;
    setIsRunning(nextState);
    setJustFinished(false);

    if (nextState) {
      if (autoPlayOnStart) {
        playVideoSafely();
      }
    }
  };

  // Reset Timer
  const handleResetTimer = () => {
    playTickSound();
    stopRepeatingAlarm();
    setIsAlarmRinging(false);
    setIsRunning(false);
    setRemainingSeconds(totalSeconds);
    setJustFinished(false);
  };

  // Adjust Remaining Time (+1m, +5m, +10m)
  const adjustTime = (deltaSeconds: number) => {
    playTickSound();
    stopRepeatingAlarm();
    setIsAlarmRinging(false);
    setRemainingSeconds((prev) => Math.max(10, prev + deltaSeconds));
    setTotalSeconds((prev) => Math.max(10, prev + deltaSeconds));
  };

  // Countdown Hook with Repeating Alarm
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && remainingSeconds > 0) {
      interval = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setJustFinished(true);
            if (soundEnabled) {
              setIsAlarmRinging(true);
              startRepeatingAlarm(() => {
                setIsAlarmRinging(false);
              });
            }
            if (autoPauseOnEnd) {
              pauseVideoSafely();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, remainingSeconds, soundEnabled, autoPauseOnEnd, pauseVideoSafely]);

  // Clean up alarm on unmount
  useEffect(() => {
    return () => {
      stopRepeatingAlarm();
    };
  }, []);

  // Option Toggles
  const handleToggleAutoPlayOnStart = (val: boolean) => {
    setAutoPlayOnStart(val);
    safeStorage.setItem(STORAGE_KEYS.AUTO_PLAY_ON_START, String(val));
  };

  const handleToggleAutoPauseOnEnd = (val: boolean) => {
    setAutoPauseOnEnd(val);
    safeStorage.setItem(STORAGE_KEYS.AUTO_PAUSE_ON_END, String(val));
  };

  const handleToggleSound = (val: boolean) => {
    setSoundEnabled(val);
    safeStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(val));
  };

  // Formatting Time
  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Circular Progress Calculation (12시 정각에서 시계방향으로 게이지가 깎여나가며 줄어들도록 설정)
  const remainingRatio = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  // 440 circumference: 12시 정각에서 시작하여 시계 방향(Clockwise)으로 줄어듦
  const strokeDashoffset = -440 * (1 - remainingRatio);

  return (
    <div className={`w-full space-y-4 ${isZenMode ? 'fixed inset-0 z-50 bg-[#090d16] p-4 sm:p-6 overflow-y-auto' : ''}`}>
      {/* Zen Mode Header Bar */}
      {isZenMode && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
            <span className="text-sm font-bold text-white">전체화면 모드</span>
          </div>
          <button
            onClick={() => setIsZenMode(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
          >
            <Minimize2 className="w-4 h-4" />
            <span>일반 모드로 복귀</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3-Column Maximum Width Responsive Layout                                  */}
      {/* [10% 좌측 카페 샘플 5개 세로 배열] + [70% 중앙 유튜브] + [20% 우측 타이머] */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row gap-4 xl:gap-5 w-full items-start">
        {/* ========================================================================= */}
        {/* 1. LEFT AREA (~10-12% on Desktop): 5 Cafe Music Samples (Vertical List)   */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[13%] xl:w-[11%] flex-shrink-0 space-y-2.5 order-3 lg:order-1">
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-2.5">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-800/80">
              <Coffee className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <h3 className="text-xs font-bold text-white tracking-tight">카페 & 찬양 5선</h3>
            </div>

            {/* Cafe Music Items (Grid on mobile, column on desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
              {CAFE_SAMPLES.map((sample, idx) => {
                const isActive = currentVideoId === sample.youtubeId;
                return (
                  <button
                    key={sample.id}
                    onClick={() => {
                      const url = `https://www.youtube.com/watch?v=${sample.youtubeId}`;
                      setYoutubeInput(url);
                      handleApplyYoutubeUrl(url, sample.title);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group flex flex-col gap-1 relative overflow-hidden ${
                      isActive
                        ? 'border-amber-500/80 bg-gradient-to-br from-amber-950/40 to-slate-900 text-white shadow-md shadow-amber-500/10 ring-1 ring-amber-500/40'
                        : 'border-slate-800 bg-slate-950/60 hover:bg-slate-800/60 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">{sample.emoji}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${isActive ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500'}`}>
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className={`text-xs font-bold leading-tight truncate ${isActive ? 'text-amber-300' : 'text-slate-200 group-hover:text-white'}`}>
                        {sample.title}
                      </p>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5 leading-snug">
                        {sample.desc}
                      </p>
                    </div>

                    {isActive && (
                      <div className="flex items-center gap-1 text-[9px] text-amber-400 font-semibold pt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>재생 중</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. CENTER AREA (~68-70% on Desktop): YouTube Link Bar & Wide Player Screen */}
        {/* ========================================================================= */}
        <div className="w-full lg:flex-1 space-y-3.5 order-2 lg:order-2">
          {/* YouTube Link Input Bar */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyYoutubeUrl();
                  }}
                  placeholder="유튜브 영상 링크(URL) 입력 후 엔터"
                  className="w-full px-4 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition"
                />
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => handleApplyYoutubeUrl()}
                  className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>적용 및 재생</span>
                </button>
                <button
                  onClick={handleSaveFavorite}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  title="현재 영상을 보관함에 저장"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsZenMode(!isZenMode)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition hidden sm:flex items-center justify-center cursor-pointer"
                  title="전체화면 모드"
                >
                  {isZenMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* YouTube Video Player Embed Screen (10% 축소) */}
          <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl aspect-video w-full max-w-[90%] mx-auto group">
            <div id={containerId} className="w-full h-full" />

            {/* Error Overlay */}
            {playerError && (
              <div className="absolute inset-0 z-20 bg-slate-950/90 backdrop-blur-sm p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1">
                  <h4 className="text-white font-bold text-sm">영상 재생 안내</h4>
                  <p className="text-slate-300 text-xs leading-relaxed">{playerError}</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <a
                    href={`https://www.youtube.com/watch?v=${currentVideoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    유튜브에서 직접 열기
                  </a>
                  <button
                    onClick={() => {
                      const first = CAFE_SAMPLES[0];
                      setYoutubeInput(`https://www.youtube.com/watch?v=${first.youtubeId}`);
                      handleApplyYoutubeUrl(`https://www.youtube.com/watch?v=${first.youtubeId}`, first.title);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    카페 추천곡으로 재생
                  </button>
                </div>
              </div>
            )}

            {/* Video overlay title badge */}
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-950/85 backdrop-blur-md border border-slate-800/80 text-[11px] text-white flex items-center gap-2 pointer-events-none z-10">
              <span
                className={`w-2 h-2 rounded-full ${
                  playerState === 'playing' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="font-medium truncate max-w-sm">{currentTitle}</span>
              <span className="text-[10px] text-slate-400">
                {playerState === 'playing' ? '(재생 중)' : playerState === 'buffering' ? '(로딩 중)' : '(일시정지)'}
              </span>
            </div>

            {/* Direct Play/Pause Quick Control Bar overlay on bottom right */}
            <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800/80 text-xs">
              <button
                onClick={() => {
                  if (playerState === 'playing') {
                    pauseVideoSafely();
                  } else {
                    playVideoSafely();
                  }
                }}
                className="flex items-center gap-1.5 text-white hover:text-indigo-300 font-semibold cursor-pointer"
              >
                {playerState === 'playing' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>영상 멈춤</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>영상 재생</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Saved Favorites List (if any) */}
          {savedFavorites.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                보관함 ({savedFavorites.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {savedFavorites.map((fav) => (
                  <div
                    key={fav.videoId}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
                  >
                    <button
                      onClick={() => {
                        setYoutubeInput(fav.url);
                        handleApplyYoutubeUrl(fav.url, fav.title);
                      }}
                      className="hover:text-white truncate max-w-[220px] cursor-pointer"
                    >
                      {fav.title}
                    </button>
                    <button
                      onClick={() => handleRemoveFavorite(fav.videoId)}
                      className="text-slate-500 hover:text-red-400 ml-1 cursor-pointer"
                      title="보관함에서 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. RIGHT AREA (~20% on Desktop): Graphical Circular Timer Widget          */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[22%] xl:w-[20%] lg:sticky lg:top-20 space-y-4 order-1 lg:order-3">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">타이머</h3>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {Math.round(totalSeconds / 60)}분 설정
              </div>
            </div>

            {/* Circular Graphic Visualization */}
            <div className="relative flex flex-col items-center justify-center my-2">
              <div className="relative w-44 h-44 flex items-center justify-center">
                {/* SVG Ring (Clockwise from 12 o'clock) */}
                <svg className="w-full h-full transform -rotate-90 origin-center" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-slate-800"
                    fill="transparent"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="url(#timerGradient)"
                    strokeWidth="9"
                    strokeDasharray="440"
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={
                      isRunning
                        ? 'transition-[stroke-dashoffset] duration-1000 ease-linear'
                        : 'transition-[stroke-dashoffset] duration-300 ease-out'
                    }
                    fill="transparent"
                  />
                  <defs>
                    <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="50%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <div
                    className={`text-3xl font-extrabold tracking-tight font-mono ${
                      isAlarmRinging
                        ? 'text-amber-400 animate-pulse'
                        : justFinished
                        ? 'text-emerald-400 animate-bounce'
                        : 'text-white'
                    }`}
                  >
                    {formatTime(remainingSeconds)}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 mt-1 flex items-center gap-1">
                    {isAlarmRinging ? (
                      <button
                        onClick={handleStopAlarm}
                        className="mt-1 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold animate-pulse hover:bg-amber-500/30 flex items-center gap-1 cursor-pointer"
                        title="알림 소리 끄기"
                      >
                        <Bell className="w-3.5 h-3.5 animate-bounce" />
                        <span>알림 끄기</span>
                      </button>
                    ) : isRunning ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        진행 중
                      </span>
                    ) : remainingSeconds === 0 ? (
                      <span className="text-emerald-400 font-bold">시간 종료</span>
                    ) : (
                      <span>일시 정지</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Main Action Controls */}
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                {isAlarmRinging ? (
                  <button
                    onClick={handleStopAlarm}
                    className="flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-600 hover:to-rose-600 text-white shadow-lg shadow-amber-500/30 transition-all cursor-pointer animate-pulse ring-2 ring-amber-400/50"
                  >
                    <BellOff className="w-4 h-4 fill-white" />
                    <span>알림 끄기</span>
                  </button>
                ) : (
                  <button
                    onClick={handleToggleTimer}
                    className={`flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                      isRunning
                        ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <Pause className="w-4 h-4 fill-white" />
                        <span>일시정지</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>{remainingSeconds === 0 ? '다시 시작' : '타이머 시작'}</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={handleResetTimer}
                  className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  title="타이머 리셋"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Quick +1m / +5m / +10m buttons */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => adjustTime(60)}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition cursor-pointer"
                >
                  +1분
                </button>
                <button
                  onClick={() => adjustTime(300)}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition cursor-pointer"
                >
                  +5분
                </button>
                <button
                  onClick={() => adjustTime(600)}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-[11px] text-slate-300 font-medium transition cursor-pointer"
                >
                  +10분
                </button>
              </div>
            </div>

            {/* Mode Presets: 3열 레이아웃 (좌에서 우: 30, 15, 직접설정(버튼 아님) / 12, 10, 입력창) */}
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <label className="text-[11px] font-semibold text-slate-400 block">
                시간 선택
              </label>
              <div className="grid grid-cols-3 gap-1.5 items-center">
                {/* 1열 1행: 30 */}
                <button
                  onClick={() => handleSelectPreset(30)}
                  className={`py-2 px-1.5 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                    selectedPresetMin === 30
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
                  }`}
                >
                  30
                </button>

                {/* 2열 1행: 15 */}
                <button
                  onClick={() => handleSelectPreset(15)}
                  className={`py-2 px-1.5 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                    selectedPresetMin === 15
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
                  }`}
                >
                  15
                </button>

                {/* 3열 1행: 직접설정 (버튼 아님) */}
                <div className="py-2 px-1.5 rounded-xl text-xs font-semibold text-slate-400 text-center bg-slate-900/60 border border-slate-800/80 select-none">
                  직접설정
                </div>

                {/* 1열 2행: 12 */}
                <button
                  onClick={() => handleSelectPreset(12)}
                  className={`py-2 px-1.5 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                    selectedPresetMin === 12
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
                  }`}
                >
                  12
                </button>

                {/* 2열 2행: 10 */}
                <button
                  onClick={() => handleSelectPreset(10)}
                  className={`py-2 px-1.5 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                    selectedPresetMin === 10
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
                  }`}
                >
                  10
                </button>

                {/* 3열 2행: 입력창 */}
                <div className="relative flex items-center w-full">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={customMinutesInput}
                    onChange={handleCustomMinutesChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSetCustomMinutes();
                    }}
                    placeholder="분"
                    className={`w-full py-2 pl-2 pr-4 bg-slate-950 border rounded-xl text-xs text-white text-center font-mono focus:outline-none transition ${
                      selectedPresetMin === 'custom'
                        ? 'border-indigo-500 ring-1 ring-indigo-500/50'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  />
                  <span className="absolute right-1.5 text-[10px] text-slate-500 pointer-events-none">분</span>
                </div>
              </div>
            </div>

            {/* Smart Sync & Options (Toggles) */}
            <div className="space-y-2.5 border-t border-slate-800 pt-3 text-[11px] text-slate-300">
              <label className="flex items-center justify-between cursor-pointer select-none">
                <span className="font-medium text-white">시작 시 영상 자동 재생</span>
                <input
                  type="checkbox"
                  checked={autoPlayOnStart}
                  onChange={(e) => handleToggleAutoPlayOnStart(e.target.checked)}
                  className="accent-indigo-500 rounded w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer select-none">
                <span>종료 시 영상 자동 일시정지</span>
                <input
                  type="checkbox"
                  checked={autoPauseOnEnd}
                  onChange={(e) => handleToggleAutoPauseOnEnd(e.target.checked)}
                  className="accent-indigo-500 rounded w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer select-none">
                <span>알림음 (차임벨)</span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => handleToggleSound(e.target.checked)}
                  className="accent-indigo-500 rounded w-4 h-4 cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
