/**
 * One card's recorded voice line, from its media key to silence: the clip's signed URL, a player
 * that starts once loaded (unless the story is paused), the guide's music ducked under it and the
 * playback session held while it speaks. `stop()` silences it at once: the player is paused before
 * it is released, because releasing a player alone leaves it sounding until it is collected.
 */
export interface NarrationAudio {
  play(): void;
  pause(): void;
  remove(): void;
  addListener(
    event: 'playbackStatusUpdate',
    listener: (status: { readonly didJustFinish?: boolean }) => void,
  ): { remove(): void };
}

export interface NarrationDeps {
  /** The clip's signed URL, or null when it cannot be read now. */
  readonly readUrl: (mediaKey: string) => Promise<string | null>;
  readonly createPlayer: (url: string) => NarrationAudio;
  /** Holds the playback audio session; returns its release. */
  readonly acquireSession: () => () => void;
  /** Ducks the music; returns its restore. */
  readonly duck: () => () => void;
}

export interface Narration {
  setPaused(paused: boolean): void;
  /** Silences the line and lets go of everything it held. Safe to call twice. */
  stop(): void;
}

export function startNarration(
  mediaKey: string,
  deps: NarrationDeps,
  /** The line has nothing more to say: it finished, could not load, or was stopped. */
  onDone: () => void,
): Narration {
  let audio: NarrationAudio | null = null;
  let paused = false;
  let ended = false;
  let restore: (() => void) | null = null;
  let release: (() => void) | null = null;

  const end = () => {
    if (ended) return;
    ended = true;
    audio?.pause();
    audio?.remove();
    audio = null;
    restore?.();
    release?.();
    restore = null;
    release = null;
    onDone();
  };

  void deps.readUrl(mediaKey).then(
    (url) => {
      if (ended) return;
      if (url === null) {
        end();
        return;
      }
      audio = deps.createPlayer(url);
      release = deps.acquireSession();
      restore = deps.duck();
      audio.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish === true) end();
      });
      if (!paused) audio.play();
    },
    () => end(),
  );

  return {
    setPaused(next) {
      if (ended || paused === next) return;
      paused = next;
      if (next) audio?.pause();
      else audio?.play();
    },
    stop: end,
  };
}
