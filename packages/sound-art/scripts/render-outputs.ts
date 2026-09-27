import { hashPcm } from '../src/core/hash';
import { measureLoopSeam } from '../src/core/mixer';
import { SAMPLE_RATE } from '../src/core/signal';
import { buildSfxRegistry } from '../src/cues/registry';
import { renderNotify } from '../src/cues/notify';
import { integratedLufs } from '../src/loudness/lufs';
import { matchLoudnessWithLimiter } from '../src/loudness/match';
import { truePeakDb } from '../src/loudness/peak';
import { buildThemeRegistry, GUIDE_IDS } from '../src/music/registry';
import { renderTheme } from '../src/music/render-theme';
import {
  SFX_FAMILY_TARGET_LUFS,
  SFX_LUFS_TOLERANCE,
  SFX_TRUE_PEAK_CEILING_DB,
  type MusicManifestEntry,
  type NotifyManifestEntry,
  type SfxManifestEntry,
} from './manifest-types';

export interface RenderedSfx {
  readonly entry: SfxManifestEntry;
  readonly pcm: Float32Array;
}

export interface RenderedNotify {
  readonly entry: NotifyManifestEntry;
  readonly pcm: Float32Array;
}

export interface RenderedMusic {
  readonly entry: MusicManifestEntry;
  readonly pcm: Float32Array;
  readonly previewPcm: Float32Array;
}

/** Loudness-matches an SFX/notify cue to its family target with a look-ahead limiter (see
 * `loudness/match.ts`), so a peaky, near-instant-attack cue isn't backed off further than it needs to
 * be to hold the true-peak ceiling. */
function normalizeSfx(pcm: Float32Array, targetLufs: number, label: string): void {
  matchLoudnessWithLimiter(pcm, {
    targetLufs,
    toleranceLu: SFX_LUFS_TOLERANCE,
    ceilingDb: SFX_TRUE_PEAK_CEILING_DB,
    lookaheadSec: 0.003,
    releaseSec: 0.05,
    sampleRate: SAMPLE_RATE,
    label,
  });
}

export function renderAllSfx(): RenderedSfx[] {
  return buildSfxRegistry().map((cue) => {
    const pcm = cue.render();
    const targetLufs = SFX_FAMILY_TARGET_LUFS[cue.category] ?? -18;
    normalizeSfx(pcm, targetLufs, `sfx "${cue.id}"`);
    return {
      pcm,
      entry: {
        id: cue.id,
        assetBasename: cue.assetBasename,
        category: cue.category,
        kind: cue.kind,
        durationSec: pcm.length / SAMPLE_RATE,
        loudnessLufs: integratedLufs(pcm, SAMPLE_RATE),
        truePeakDb: truePeakDb(pcm),
        pcmHash: hashPcm(pcm),
        files: { caf: `sfx/${cue.assetBasename}.caf`, ogg: `sfx/${cue.assetBasename}.ogg` },
      },
    };
  });
}

export function renderAllNotify(): RenderedNotify[] {
  return GUIDE_IDS.map((guideId) => {
    const pcm = renderNotify(guideId);
    normalizeSfx(pcm, SFX_FAMILY_TARGET_LUFS.notify ?? -16, `notify "${guideId}"`);
    const assetBasename = `notify-${guideId}`;
    return {
      pcm,
      entry: {
        guideId,
        assetBasename,
        durationSec: pcm.length / SAMPLE_RATE,
        loudnessLufs: integratedLufs(pcm, SAMPLE_RATE),
        truePeakDb: truePeakDb(pcm),
        pcmHash: hashPcm(pcm),
        files: { caf: `sfx/${assetBasename}.caf`, ogg: `sfx/${assetBasename}.ogg` },
      },
    };
  });
}

export function renderAllMusic(): RenderedMusic[] {
  return buildThemeRegistry().map((spec) => {
    const rendered = renderTheme(spec);
    const seam = measureLoopSeam(rendered.pcm);
    if (seam.wrapJump !== 0) {
      throw new Error(
        `sound-art bake: "${spec.guideId}" loop seam is not closed (wrap jump ${seam.wrapJump})`,
      );
    }
    return {
      pcm: rendered.pcm,
      previewPcm: rendered.previewPcm,
      entry: {
        guideId: spec.guideId,
        title: spec.title,
        styleDescription: spec.styleDescription,
        proposalPendingApproval: Boolean(spec.proposalPendingApproval),
        durationSec: rendered.durationSec,
        loudnessLufs: rendered.loudnessLufs,
        truePeakDb: truePeakDb(rendered.pcm),
        loopStartSample: 0,
        loopEndSample: rendered.pcm.length,
        pcmHash: hashPcm(rendered.pcm),
        previewPcmHash: hashPcm(rendered.previewPcm),
        files: { loop: `music/${spec.guideId}.m4a`, preview: `music/${spec.guideId}-preview.m4a` },
      },
    };
  });
}
