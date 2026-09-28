/**
 * Which of Tokek's scripted lines answers the name so far (3a-2). Pure: the screen feeds it the
 * name after 600–800 ms without typing. Nothing here, or anywhere, sends the name off the device.
 */
import { GIVEN_NAME_MAX, givenNameLength, givenNameProblem, mrzName } from '@cp/domain';

import type { TokekLineTrigger } from '../content';

export function nameReaction(name: string, blocked: readonly string[]): TokekLineTrigger {
  const problem = givenNameProblem(name, blocked);
  if (problem === 'empty') return 'empty';
  if (problem === 'blocked') return 'blocked';
  if (givenNameLength(name) >= GIVEN_NAME_MAX) return 'long';
  // Letters the MRZ cannot spell (CJK, Thai, Arabic…): the pass prints them, the machine line can't.
  const letters = name.replace(/[\s\-'’.]/gu, '');
  const spelled = mrzName(name).replace(/<+/gu, '');
  if (letters.length > 0 && spelled.length < Array.from(letters).length / 2) return 'script';
  return 'idle';
}

/** 600–800 ms of quiet before Tokek reacts, varied so it doesn't feel mechanical. */
export function reactionDelayMs(name: string): number {
  return 600 + ((name.length * 37) % 201);
}
