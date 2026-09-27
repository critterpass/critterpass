import type { AudioSource } from 'expo-audio';

import type { SoundCueId } from '../impact';

import thudHeavy from '../../../assets/sfx/thud-heavy.caf';
import thudSoft from '../../../assets/sfx/thud-soft.caf';
import slap from '../../../assets/sfx/slap.caf';
import peel from '../../../assets/sfx/peel.caf';
import whoosh from '../../../assets/sfx/whoosh.caf';
import tick from '../../../assets/sfx/tick.caf';
import snap from '../../../assets/sfx/snap.caf';
import success from '../../../assets/sfx/success.caf';
import warning from '../../../assets/sfx/warning.caf';
import error from '../../../assets/sfx/error.caf';
import vote from '../../../assets/sfx/vote.caf';
import bell from '../../../assets/sfx/bell.caf';
import alarm from '../../../assets/sfx/alarm-guide.caf';
import eggCrack from '../../../assets/sfx/egg-crack.caf';
import eggPop from '../../../assets/sfx/egg-pop.caf';
import critterChirp from '../../../assets/sfx/critter-chirp.caf';
import flap from '../../../assets/sfx/flap.caf';
import printer from '../../../assets/sfx/printer.caf';
import scanner from '../../../assets/sfx/scanner.caf';
import shutter from '../../../assets/sfx/shutter.caf';
import pen from '../../../assets/sfx/pen.caf';
import page from '../../../assets/sfx/page.caf';
import envelope from '../../../assets/sfx/envelope.caf';

/**
 * iOS SFX/ambient assets, keyed by cue id: uncompressed PCM in a Core Audio Format container, what
 * `AVAudioPlayer` expects for a short, zero-decode-latency SFX. Metro picks this file over
 * `sfx-assets.android.ts` for iOS bundles, so the Android `.ogg` files never ship in the iOS app.
 * Both platform maps must list the same cues (`tools/scripts/check-audio-assets.ts` enforces it).
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
