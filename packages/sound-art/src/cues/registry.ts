import { tokens } from '@cp/design-tokens';

import { renderCritterChirp, renderEggCrack, renderEggPop } from './critter-voices';
import { renderAlarmGuide, renderError, renderVote, renderWarning } from './alerts';
import {
  renderEnvelope,
  renderFlap,
  renderPage,
  renderPen,
  renderPrinter,
  renderScanner,
  renderShutter,
} from './paper-desk';
import {
  renderPeel,
  renderSlap,
  renderThudHeavy,
  renderThudSoft,
  renderWhoosh,
} from './paper-and-stamps';
import { renderBell, renderSnap, renderSuccess, renderTick } from './taps-and-chimes';

/** Every `sound.tokens.json` cue id that carries a real (non-haptic-only) SFX/ambient asset. */
export const SFX_TOKEN_IDS = [
  'thud.heavy',
  'thud.soft',
  'slap',
  'peel',
  'whoosh',
  'tick',
  'snap',
  'success',
  'warning',
  'error',
  'vote',
  'bell',
  'alarm',
  'crack',
  'pop',
  'chirp',
  'flap',
  'printer',
  'scanner',
  'shutter',
  'pen',
  'page',
  'envelope',
] as const;

export type SfxTokenId = (typeof SFX_TOKEN_IDS)[number];

export interface SfxCueSpec {
  readonly id: SfxTokenId;
  /** Output basename (no extension), relative to the bake's sfx output directory. */
  readonly assetBasename: string;
  readonly category: string;
  readonly kind: 'sfx' | 'ambient';
  readonly render: () => Float32Array;
}

function seedFor(id: SfxTokenId): string {
  return `sfx:${id}:v1`;
}

const RENDERERS: Readonly<Record<SfxTokenId, () => Float32Array>> = {
  'thud.heavy': () => renderThudHeavy(seedFor('thud.heavy')),
  'thud.soft': () => renderThudSoft(seedFor('thud.soft')),
  slap: () => renderSlap(seedFor('slap')),
  peel: () => renderPeel(seedFor('peel')),
  whoosh: () => renderWhoosh(seedFor('whoosh')),
  tick: () => renderTick(seedFor('tick')),
  snap: () => renderSnap(seedFor('snap')),
  success: () => renderSuccess(),
  warning: () => renderWarning(),
  error: () => renderError(),
  vote: () => renderVote(seedFor('vote')),
  bell: () => renderBell(),
  alarm: () => renderAlarmGuide(),
  crack: () => renderEggCrack(seedFor('crack')),
  pop: () => renderEggPop(seedFor('pop')),
  chirp: () => renderCritterChirp(seedFor('chirp')),
  flap: () => renderFlap(seedFor('flap')),
  printer: () => renderPrinter(seedFor('printer')),
  scanner: () => renderScanner(seedFor('scanner')),
  shutter: () => renderShutter(seedFor('shutter')),
  pen: () => renderPen(seedFor('pen')),
  page: () => renderPage(seedFor('page')),
  envelope: () => renderEnvelope(seedFor('envelope')),
};

function basenameFromAsset(assetPath: string): string {
  const withoutDir = assetPath.split('/').pop() ?? assetPath;
  return withoutDir.replace(/\.[^.]+$/, '');
}

function isSfxOrAmbient(kind: string): kind is 'sfx' | 'ambient' {
  return kind === 'sfx' || kind === 'ambient';
}

/** Builds the full SFX/ambient cue registry, cross-checked against `sound.tokens.json`. */
export function buildSfxRegistry(): SfxCueSpec[] {
  return SFX_TOKEN_IDS.map((id) => {
    const token = tokens.sound.cue[id];
    if (!token) {
      throw new Error(`sound-art: "${id}" is not defined in sound.tokens.json`);
    }
    if (!token.sfxAsset) {
      throw new Error(`sound-art: "${id}" has no sfxAsset in sound.tokens.json`);
    }
    if (!isSfxOrAmbient(token.kind)) {
      throw new Error(
        `sound-art: "${id}" has unexpected kind "${token.kind}" in sound.tokens.json`,
      );
    }
    return {
      id,
      assetBasename: basenameFromAsset(token.sfxAsset),
      category: token.category,
      kind: token.kind,
      render: RENDERERS[id],
    };
  });
}
