/**
 * The ending page's words: one hook so the legacy and the premium page say the same thing.
 */
import { useLingui } from '@lingui/react/macro';

import type { FtfKept, FtfPaused } from './ftf-ending-model';

export function useFtfEndingCopy() {
  const { t } = useLingui();
  const kept: Readonly<Record<FtfKept, string>> = {
    plan: t({ id: 'monetize.ftfEnding.kept.plan', message: 'The plan' }),
    photos: t({ id: 'monetize.ftfEnding.kept.photos', message: 'Photos' }),
    recap: t({ id: 'monetize.ftfEnding.kept.recap', message: 'The recap' }),
    critters: t({ id: 'monetize.ftfEnding.kept.critters', message: 'Critters' }),
    trail: t({ id: 'monetize.ftfEnding.kept.trail', message: 'Map trail' }),
  };
  const paused: Readonly<Record<FtfPaused, string>> = {
    guide: t({ id: 'monetize.ftfEnding.paused.guide', message: 'Unlimited Tokek' }),
    redrafts: t({ id: 'monetize.ftfEnding.paused.redrafts', message: 'Redrafts' }),
    live_map: t({ id: 'monetize.ftfEnding.paused.liveMap', message: 'Live map' }),
    icons: t({ id: 'monetize.ftfEnding.paused.icons', message: 'All icons' }),
  };
  return {
    kept,
    paused,
    title: t({ id: 'monetize.ftfEnding.title', message: 'Recap' }),
    daysLeft: t({
      id: 'monetize.ftfEnding.daysLeft',
      message: 'days left on your free first trip',
    }),
    pauses: (date: string) =>
      t({ id: 'monetize.ftfEnding.pauses', message: `Perks pause ${date}` }),
    guideNote: t({
      id: 'monetize.ftfEnding.guideNote',
      message: 'Everything you made stays. Only the extras take a nap.',
    }),
    keptLabel: t({ id: 'monetize.ftfEnding.keptLabel', message: 'Kept for good' }),
    pausedLabel: (date: string) =>
      t({ id: 'monetize.ftfEnding.pausedLabel', message: `Pauses ${date}` }),
    boost: (place: string) =>
      place === ''
        ? t({ id: 'monetize.ftfEnding.boostTrip', message: 'Boost this trip' })
        : t({ id: 'monetize.ftfEnding.boost', message: `Boost ${place}` }),
    passPlus: t({ id: 'monetize.ftfEnding.passPlus', message: 'Pass+ just for me' }),
    stayFree: t({ id: 'monetize.ftfEnding.stayFree', message: 'Stay free' }),
    ended: t({ id: 'monetize.ftfEnding.ended', message: 'Your free first trip has ended' }),
    endedLine: t({
      id: 'monetize.ftfEnding.endedLine',
      message: 'The plan, photos and critters are still yours.',
    }),
  };
}
