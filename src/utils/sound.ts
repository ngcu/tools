/**
 * Web Audio API synthesizer for clean notification chimes without external mp3 dependencies
 */
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

let alarmInterval: any = null;
let alarmTimeout: any = null;

/**
 * Play a bell/chime sound indicating timer finished
 */
export function playCompletionSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Harmonic bell chime chord: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
    const freqs = [523.25, 659.25, 783.99, 1046.50];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.1 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 1.7);
    });
  } catch (err) {
    console.error('Audio playback error:', err);
  }
}

/**
 * Start repeating alarm sound until stopped or max 1 minute (60 seconds) elapsed.
 */
export function startRepeatingAlarm(onAutoStop?: () => void): void {
  // Clear any existing alarm
  stopRepeatingAlarm();

  // Play immediately
  playCompletionSound();

  // Repeat every 2.2 seconds
  alarmInterval = setInterval(() => {
    playCompletionSound();
  }, 2200);

  // Maximum repeating duration: 60 seconds (1 minute)
  alarmTimeout = setTimeout(() => {
    stopRepeatingAlarm();
    if (onAutoStop) onAutoStop();
  }, 60000);
}

/**
 * Stop repeating alarm immediately
 */
export function stopRepeatingAlarm(): void {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (alarmTimeout) {
    clearTimeout(alarmTimeout);
    alarmTimeout = null;
  }
}

/**
 * Play a subtle click / tap sound for timer controls
 */
export function playTickSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // ignore
  }
}
