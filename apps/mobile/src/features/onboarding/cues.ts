/**
 * The sound-and-haptic cues the premium onboarding pages play (the feedback bus picks the haptic,
 * the sound and the mute rules), so the pages themselves never reach into the current motion kit.
 */
/* eslint-disable lingui/no-unlocalized-strings -- cue ids, never copy. */
import { feedback } from '@/motion/feedback';

export const onboardingCues = {
  /** A stamp or a pass landing on the page. */
  thud: () => feedback.emit('thud.heavy'),
  softThud: () => feedback.emit('thud.soft'),
  page: () => feedback.emit('page'),
  tick: () => feedback.emit('tick'),
  shutter: () => feedback.emit('shutter'),
  snap: () => feedback.emit('snap'),
};
