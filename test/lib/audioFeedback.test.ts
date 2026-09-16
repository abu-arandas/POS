import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSettingsStore } from '../../src/stores/settingsStore';

/**
 * A fresh copy of the module.
 *
 * audioFeedback caches its AudioContext for the life of the page, which is the
 * behaviour one of these tests asserts — a context per keypress exhausts the
 * browser's limit within a shift. The cost is that a second test's mock would
 * never be reached, so each test takes its own module instance.
 */
async function loadAudio() {
  vi.resetModules();
  // The settings store comes from the SAME fresh registry. resetModules gives
  // audioFeedback its own copy of every module it imports, so setting
  // soundEffects on the top-level store instance would be setting it on a
  // different object than the one the sound just loaded is reading.
  const [audio, settings] = await Promise.all([
    import('../../src/lib/audioFeedback'),
    import('../../src/stores/settingsStore'),
  ]);
  return {
    ...audio,
    setSoundEffects: (on: boolean) => settings.useSettingsStore.setState({ soundEffects: on }),
  };
}

type Audio = Awaited<ReturnType<typeof loadAudio>>;
const soundsOf = (audio: Audio) =>
  [
    ['playKeySound', audio.playKeySound],
    ['playCartSound', audio.playCartSound],
    ['playKitchenBell', audio.playKitchenBell],
    ['playSuccessChime', audio.playSuccessChime],
    ['playErrorSound', audio.playErrorSound],
  ] as const;

// These run on the hottest paths in the app: every PIN keypress, every add to
// cart, every completed sale. A throw in any of them surfaces as a till that
// stops mid-transaction — over a sound effect. jsdom has no Web Audio at all,
// which makes the unavailable case the default here rather than an edge one.

/** Records what a sound built, so "it made noise" is checkable. */
function installFakeAudio() {
  const started: number[] = [];
  const connected: string[] = [];
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: 'destination',
    resume: vi.fn(() => Promise.resolve()),
    createOscillator: vi.fn(() => ({
      type: '',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn((target: unknown) => connected.push(String(target))),
      start: vi.fn((t?: number) => started.push(t ?? 0)),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn((target: unknown) => connected.push(String(target))),
    })),
  };
  // A class, not `vi.fn(() => ctx)`: an arrow function cannot be called with
  // `new`, and the TypeError would be swallowed by the very try/catch these
  // tests exist to check — leaving the mock looking installed and every sound
  // silently doing nothing.
  const Ctor = vi.fn(function AudioContextMock(this: unknown) {
    return ctx;
  });
  vi.stubGlobal('AudioContext', Ctor);
  return { ctx, ctor: Ctor, oscillators: () => started.length };
}

beforeEach(() => {
  useSettingsStore.setState({ soundEffects: true });
});

afterEach(() => vi.unstubAllGlobals());

describe('audioFeedback without Web Audio', () => {
  it('never throws, for any sound', async () => {
    // jsdom provides no AudioContext. This is the real deployment case too:
    // a locked-down kiosk, no output device, an autoplay policy refusing.
    vi.stubGlobal('AudioContext', undefined);
    for (const [name, play] of soundsOf(await loadAudio())) {
      expect(() => play(), `${name} threw`).not.toThrow();
    }
  });

  it('never throws when constructing the context itself fails', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function Failing() {
        throw new Error('no audio device');
      }),
    );
    for (const [name, play] of soundsOf(await loadAudio())) {
      expect(() => play(), `${name} threw`).not.toThrow();
    }
  });
});

describe('audioFeedback respects the setting', () => {
  it('reads the preference from the settings store', async () => {
    const { isAudioFeedbackEnabled, setSoundEffects } = await loadAudio();
    setSoundEffects(true);
    expect(isAudioFeedbackEnabled()).toBe(true);
    setSoundEffects(false);
    expect(isAudioFeedbackEnabled()).toBe(false);
  });

  it('builds nothing at all when sound is off', async () => {
    // Checked before the context is touched: an operator who turned sound off
    // should not have an AudioContext created on their terminal either.
    const fake = installFakeAudio();
    const audio = await loadAudio();
    audio.setSoundEffects(false);

    for (const [, play] of soundsOf(audio)) play();

    expect(fake.oscillators()).toBe(0);
    expect(fake.ctor).not.toHaveBeenCalled();
  });

  it('makes noise when sound is on', async () => {
    const fake = installFakeAudio();
    for (const [, play] of soundsOf(await loadAudio())) play();
    expect(fake.oscillators()).toBeGreaterThan(0);
  });

  it('plays every tone of the multi-tone sounds', async () => {
    // The bell is two tones and the success chime is a four-note arpeggio;
    // dropping to one would still "work" and sound wrong.
    const bell = installFakeAudio();
    (await loadAudio()).playKitchenBell();
    expect(bell.oscillators()).toBe(2);

    const chime = installFakeAudio();
    (await loadAudio()).playSuccessChime();
    expect(chime.oscillators()).toBe(4);
  });

  it('reuses one AudioContext across sounds rather than one per call', async () => {
    // A context per keypress exhausts the browser's limit within a shift.
    const fake = installFakeAudio();
    const audio = await loadAudio();
    audio.playKeySound();
    audio.playKeySound();
    audio.playCartSound();
    expect(fake.ctor).toHaveBeenCalledTimes(1);
  });

  it('resumes a context the browser suspended', async () => {
    // Autoplay policy starts it suspended until a gesture; without the resume
    // the first sounds of a session are silent.
    const fake = installFakeAudio();
    fake.ctx.state = 'suspended';
    (await loadAudio()).playKeySound();
    expect(fake.ctx.resume).toHaveBeenCalled();
  });
});
