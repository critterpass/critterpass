/* eslint-disable lingui/no-unlocalized-strings -- selectors and style values; the words arrive
   translated in the page strings (src/scripts/page-strings.ts). */
/**
 * The "hatch an egg" preview: three taps crack the egg and reveal the next local from the pool;
 * "hatch another" puts a fresh egg back.
 */
import { HATCH_POOL } from '../lib/hatch-pool';
import { burstConfetti } from './confetti';
import { csEl, setText } from './dom';
import { fill } from './page-strings';
import type { PageStrings } from './page-strings';

const EGG_TRANSFORM_BY_TAPS = [
  'rotate(0deg)',
  'rotate(-12deg) scale(1.05)',
  'rotate(14deg) scale(1.12)',
] as const;

export function startEggHatch(
  root: ParentNode,
  strings: Pick<PageStrings, 'eggHints' | 'hatchedNumber' | 'hatchLines'>,
): void {
  let eggTaps = 0;
  let eggSeed = 12;
  let hatchCycle = -1;

  function updateEggUi(): void {
    setText(csEl(root, 'egg-hint'), strings.eggHints[eggTaps] ?? strings.eggHints[0]);
    const button = csEl(root, 'egg-button');
    if (button) button.style.transform = EGG_TRANSFORM_BY_TAPS[eggTaps] ?? 'none';
    const dots = csEl(root, 'tap-dots')?.children ?? [];
    Array.from(dots).forEach((dot, index) =>
      dot.setAttribute('data-filled', String(index < eggTaps)),
    );
  }

  function onEggTap(): void {
    if (eggTaps < 2) {
      eggTaps += 1;
      updateEggUi();
      return;
    }
    hatchCycle = (hatchCycle + 1) % HATCH_POOL.length;
    eggTaps = 0;
    const local = HATCH_POOL[hatchCycle];
    if (!local) return;
    csEl(root, 'egg-not-hatched')?.setAttribute('hidden', '');
    csEl(root, 'egg-hatched')?.removeAttribute('hidden');
    setText(
      csEl(root, 'hatched-number'),
      fill(strings.hatchedNumber, { num: local.num, city: local.city }),
    );
    setText(csEl(root, 'hatched-name'), local.name);
    setText(csEl(root, 'hatched-species'), strings.hatchLines[local.id] ?? '');
    const critter = csEl(root, 'hatched-critter');
    if (critter) {
      critter.setAttribute('kind', local.id);
      critter.setAttribute('seed', '1');
    }
    burstConfetti(csEl(root, 'egg-confetti'));
  }

  function onHatchAgain(): void {
    eggTaps = 0;
    eggSeed += 7;
    const eggCritter = csEl(root, 'egg-critter');
    if (eggCritter) eggCritter.setAttribute('seed', String(eggSeed));
    updateEggUi();
    csEl(root, 'egg-hatched')?.setAttribute('hidden', '');
    csEl(root, 'egg-not-hatched')?.removeAttribute('hidden');
  }

  csEl(root, 'egg-button')?.addEventListener('click', onEggTap);
  csEl(root, 'hatch-again')?.addEventListener('click', onHatchAgain);
}
