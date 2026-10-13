export interface SoundValues {
  readonly musicEnabled: boolean;
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly stickers: boolean;
  readonly critterVoices: boolean;
  readonly quietOnTheRoad: boolean;
  readonly haptics: boolean;
  /** Theme cards, in order. */
  readonly themes: readonly string[];
  /** The theme that plays now (pinned, or the guide's). */
  readonly current: string | undefined;
  readonly pinned: boolean;
}

export interface SoundHandlers {
  readonly onMusic: (next: boolean) => void;
  readonly onMusicVolume: (next: number) => void;
  readonly onEffectsVolume: (next: number) => void;
  readonly onStickers: (next: boolean) => void;
  readonly onCritterVoices: (next: boolean) => void;
  readonly onQuiet: (next: boolean) => void;
  readonly onHaptics: (next: boolean) => void;
  readonly onTheme: (guideId: string) => void;
  readonly onFollow: () => void;
  readonly onBack?: () => void;
}
