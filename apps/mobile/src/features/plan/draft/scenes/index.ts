/**
 * Every fixed drafting scene for `(dev)/draft` and the screenshot flows: each renders its real
 * view over the Kyoto fixture (./fixtures.ts), with no database or network.
 */
import { DRAFTING_SCENES } from '../drafting/scenes';
import type { DraftScene } from './types';

export { sceneExit, type DraftScene } from './types';

export const DRAFT_SCENES: readonly DraftScene[] = [...DRAFTING_SCENES];
