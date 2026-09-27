export interface SfxManifestEntry {
  readonly id: string;
  readonly assetBasename: string;
  readonly category: string;
  readonly kind: 'sfx' | 'ambient';
  readonly durationSec: number;
  readonly loudnessLufs: number;
  readonly truePeakDb: number;
  readonly pcmHash: string;
  readonly files: { readonly caf: string; readonly ogg: string };
}

export interface NotifyManifestEntry {
  readonly guideId: string;
  readonly assetBasename: string;
  readonly durationSec: number;
  readonly loudnessLufs: number;
  readonly truePeakDb: number;
  readonly pcmHash: string;
  readonly files: { readonly caf: string; readonly ogg: string };
}

export interface MusicManifestEntry {
  readonly guideId: string;
  readonly title: string;
  readonly styleDescription: string;
  readonly proposalPendingApproval: boolean;
  readonly durationSec: number;
  readonly loudnessLufs: number;
  readonly truePeakDb: number;
  readonly loopStartSample: number;
  readonly loopEndSample: number;
  readonly pcmHash: string;
  readonly previewPcmHash: string;
  readonly files: { readonly loop: string; readonly preview: string };
}

export interface BakeManifest {
  readonly generatedAt: string;
  readonly sampleRate: number;
  readonly sfx: readonly SfxManifestEntry[];
  readonly notify: readonly NotifyManifestEntry[];
  readonly music: readonly MusicManifestEntry[];
}

/** Family-level short-term loudness targets (LUFS) — every cue in a family normalises to the same
 * value, so a family reads as consistently loud regardless of which specific cue plays. */
export const SFX_FAMILY_TARGET_LUFS: Readonly<Record<string, number>> = {
  'stickers-and-stamps': -16,
  effects: -18,
  'critter-voices': -20,
  notify: -16,
};

export const SFX_TRUE_PEAK_CEILING_DB = -1;
