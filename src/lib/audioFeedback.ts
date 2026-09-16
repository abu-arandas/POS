/**
 * Synthesized audio feedback engine using the native Web Audio API.
 * 100% offline, zero external asset downloads or network latency.
 */
import { useSettingsStore } from '../stores/settingsStore';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Whether the terminal plays feedback sounds.
 *
 * Read from the settings store rather than a bare localStorage key. The key was
 * a settings surface nothing else knew about: it did not appear in Settings, it
 * was not persisted with the rest of the configuration, and "Reset to defaults"
 * did not touch it — so an operator who wanted the till quiet had no way to say
 * so, and no way to find out why it was.
 */
export function isAudioFeedbackEnabled(): boolean {
  return useSettingsStore.getState().soundEffects;
}

/**
 * Short crisp click/blip for keyboard & numpad input
 */
export function playKeySound(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Audio is a nicety, never a blocker: a browser that refuses to build an
    // AudioContext (autoplay policy, no output device, a locked-down kiosk)
    // must not stop a sale going through.
  }
}

/**
 * Cheerful pop when adding an item to the cart
 */
export function playCartSound(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch {
    // Audio is a nicety, never a blocker: a browser that refuses to build an
    // AudioContext (autoplay policy, no output device, a locked-down kiosk)
    // must not stop a sale going through.
  }
}

/**
 * Elegant dual-tone restaurant service chime for Kitchen tickets
 */
export function playKitchenBell(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [
      { freq: 880, start: now, duration: 0.3, vol: 0.2 },
      { freq: 1174.66, start: now + 0.12, duration: 0.45, vol: 0.25 },
    ].forEach(({ freq, start, duration, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    });
  } catch {
    // Audio is a nicety, never a blocker: a browser that refuses to build an
    // AudioContext (autoplay policy, no output device, a locked-down kiosk)
    // must not stop a sale going through.
  }
}

/**
 * Harmonious C-major triad chime on successful checkout
 */
export function playSuccessChime(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // C5, E5, G5, C6 arpeggio
    [
      { freq: 523.25, time: now },
      { freq: 659.25, time: now + 0.08 },
      { freq: 783.99, time: now + 0.16 },
      { freq: 1046.5, time: now + 0.24 },
    ].forEach(({ freq, time }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + 0.4);
    });
  } catch {
    // Audio is a nicety, never a blocker: a browser that refuses to build an
    // AudioContext (autoplay policy, no output device, a locked-down kiosk)
    // must not stop a sale going through.
  }
}

/**
 * Subtle low error or boundary bump
 */
export function playErrorSound(): void {
  if (!isAudioFeedbackEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio is a nicety, never a blocker: a browser that refuses to build an
    // AudioContext (autoplay policy, no output device, a locked-down kiosk)
    // must not stop a sale going through.
  }
}
