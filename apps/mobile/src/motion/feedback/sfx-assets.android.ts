import type { AudioSource } from 'expo-audio';

import type { SoundCueId } from '../impact';

import thudHeavy from '../../../assets/sfx/thud-heavy.ogg';
import thudSoft from '../../../assets/sfx/thud-soft.ogg';
import slap from '../../../assets/sfx/slap.ogg';
import peel from '../../../assets/sfx/peel.ogg';
import whoosh from '../../../assets/sfx/whoosh.ogg';
import tick from '../../../assets/sfx/tick.ogg';
import snap from '../../../assets/sfx/snap.ogg';
import success from '../../../assets/sfx/success.ogg';
import warning from '../../../assets/sfx/warning.ogg';
import error from '../../../assets/sfx/error.ogg';
import vote from '../../../assets/sfx/vote.ogg';
import bell from '../../../assets/sfx/bell.ogg';
import alarm from '../../../assets/sfx/alarm-guide.ogg';
import eggCrack from '../../../assets/sfx/egg-crack.ogg';
import eggPop from '../../../assets/sfx/egg-pop.ogg';
import critterChirp from '../../../assets/sfx/critter-chirp.ogg';
import flap from '../../../assets/sfx/flap.ogg';
import printer from '../../../assets/sfx/printer.ogg';
import scanner from '../../../assets/sfx/scanner.ogg';
import shutter from '../../../assets/sfx/shutter.ogg';
import pen from '../../../assets/sfx/pen.ogg';
import page from '../../../assets/sfx/page.ogg';
import envelope from '../../../assets/sfx/envelope.ogg';

/**
 * Android SFX/ambient assets, keyed by cue id: Ogg-encapsulated Opus, which `MediaExtractor`/
 * ExoPlayer play natively. Metro picks this file over `sfx-assets.ios.ts` for Android bundles, so
 * only one file per cue lands in `res/raw` (Android resource names drop the extension, so shipping
 * the `.caf` twin too aborts Gradle's resource merge with "Duplicate resources"). Both platform maps
 * must list the same cues (`tools/scripts/check-audio-assets.ts` enforces it).
 */
export const SFX_ASSET_MODULES: Partial<Record<SoundCueId, AudioSource>> = {
  'thud.heavy': thudHeavy,
  'thud.soft': thudSoft,
  slap: slap,
  peel: peel,
  whoosh: whoosh,
  tick: tick,
  snap: snap,
  success: success,
  warning: warning,
  error: error,
  vote: vote,
  bell: bell,
  alarm: alarm,
  crack: eggCrack,
  pop: eggPop,
  chirp: critterChirp,
  flap: flap,
  printer: printer,
  scanner: scanner,
  shutter: shutter,
  pen: pen,
  page: page,
  envelope: envelope,
};
