import {
  createAudioPlayer,
  type AudioPlayer,
  type AudioSource,
  type AudioStatus,
} from 'expo-audio';

import { updateMusicLevelFromSample } from './levels';

/** docs/design-system.md §4: "music crossfades 1.5s on guide change". */
export const DEFAULT_CROSSFADE_MS = 1500;
const FADE_STEP_MS = 50;
/** docs/design-system.md §4 ducking: "duck music −12 dB" for TTS/voice mode. */
const DUCK_GAIN = 10 ** (-12 / 20);

/** The linear crossfade position at `elapsedMs` into a `durationMs` fade: 0 at the start, 1 once complete. */
export function crossfadeFraction(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.max(0, Math.min(1, elapsedMs / durationMs));
}

/**
 * Owns the two `AudioPlayer`s music themes crossfade between (docs/design-system.md §4). A module
 * singleton — like `patterns/draw.tsx`'s `drawGate` — because "the currently playing theme" is
 * app-global state, not owned by whichever screen last called `crossfadeTo`.
 */
class CrossfadeEngine {
  private playerA: AudioPlayer | null = null;
  private playerB: AudioPlayer | null = null;
  private activeIsA = true;
  private activeGuideId: string | null = null;
  private baseVolume = 1;
  private duckCount = 0;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private levelMeterCleanup: (() => void) | null = null;

  private get activePlayer(): AudioPlayer | null {
    return this.activeIsA ? this.playerA : this.playerB;
  }

  get playingGuideId(): string | null {
    return this.activeGuideId;
  }

  private effectiveVolume(): number {
    return this.baseVolume * (this.duckCount > 0 ? DUCK_GAIN : 1);
  }

  setBaseVolume(volume: number): void {
    this.baseVolume = Math.max(0, Math.min(1, volume));
    if (!this.fadeTimer) this.reapplyActiveVolume();
  }

  private reapplyActiveVolume(): void {
    const player = this.activePlayer;
    if (player) player.volume = this.effectiveVolume();
  }

  private attachLevelMeter(player: AudioPlayer): void {
    this.levelMeterCleanup?.();
    if (!player.isAudioSamplingSupported) {
      this.levelMeterCleanup = null;
      return;
    }
    player.setAudioSamplingEnabled(true);
    const subscription = player.addListener('audioSampleUpdate', updateMusicLevelFromSample);
    this.levelMeterCleanup = () => subscription.remove();
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** Recovers a player whose native media session was reset (docs/code-standards.md §14-adjacent "engine restart on reset/interruption"). */
  private watchForInterruption(player: AudioPlayer, source: AudioSource): void {
    const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (status.mediaServicesDidReset) player.replace(source);
    });
    const previousCleanup = this.levelMeterCleanup;
    this.levelMeterCleanup = () => {
      previousCleanup?.();
      subscription.remove();
    };
  }

  /** Crossfades to `guideId`'s `source` over `durationMs` (0 = switch immediately, no fade). A `null`/`undefined` source stops playback cleanly (an unlicensed or unavailable guide theme). */
  crossfadeTo(
    guideId: string | null,
    source: AudioSource | undefined,
    durationMs: number = DEFAULT_CROSSFADE_MS,
  ): void {
    if (guideId === this.activeGuideId) return;
    this.clearFadeTimer();

    if (!guideId || !source) {
      this.stop();
      return;
    }

    const incoming = this.activeIsA
      ? (this.playerB ??= createAudioPlayer())
      : (this.playerA ??= createAudioPlayer());
    incoming.loop = true;
    incoming.replace(source);
    incoming.volume = durationMs <= 0 ? this.effectiveVolume() : 0;
    incoming.play();
    this.attachLevelMeter(incoming);
    this.watchForInterruption(incoming, source);

    const outgoing = this.activePlayer;
    this.activeGuideId = guideId;

    if (durationMs <= 0) {
      outgoing?.pause();
      this.activeIsA = !this.activeIsA;
      return;
    }

    const startedAt = Date.now();
    this.fadeTimer = setInterval(() => {
      const t = crossfadeFraction(Date.now() - startedAt, durationMs);
      const target = this.effectiveVolume();
      if (outgoing) outgoing.volume = (1 - t) * target;
      incoming.volume = t * target;
      if (t >= 1) {
        outgoing?.pause();
        this.activeIsA = !this.activeIsA;
        this.clearFadeTimer();
      }
    }, FADE_STEP_MS);
  }

  stop(): void {
    this.clearFadeTimer();
    this.playerA?.pause();
    this.playerB?.pause();
    this.activeGuideId = null;
  }

  duck(): () => void {
    this.duckCount += 1;
    if (!this.fadeTimer) this.reapplyActiveVolume();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.duckCount = Math.max(0, this.duckCount - 1);
      if (!this.fadeTimer) this.reapplyActiveVolume();
    };
  }

  /** Test-only: the active/standby players' current volumes, to assert a crossfade in progress. */
  peekVolumesForTests(): { active: number | undefined; standby: number | undefined } {
    const standby = this.activeIsA ? this.playerB : this.playerA;
    return { active: this.activePlayer?.volume, standby: standby?.volume };
  }

  /** Test-only: this singleton's players and timers otherwise leak across test files. */
  resetForTests(): void {
    this.clearFadeTimer();
    this.levelMeterCleanup?.();
    this.levelMeterCleanup = null;
    this.playerA?.remove();
    this.playerB?.remove();
    this.playerA = null;
    this.playerB = null;
    this.activeIsA = true;
    this.activeGuideId = null;
    this.baseVolume = 1;
    this.duckCount = 0;
  }
}

export const musicEngine = new CrossfadeEngine();
