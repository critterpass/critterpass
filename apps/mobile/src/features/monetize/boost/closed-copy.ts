/** What the boost sheet says in place of its button when there is nothing to buy here. */
import { useLingui } from '@lingui/react/macro';

import type { BoostPhase } from './boost-model';

export interface ClosedCopy {
  readonly title: string;
  readonly line: string;
}

export function useClosedCopy(): (phase: BoostPhase, lockedBy: string) => ClosedCopy | null {
  const { t } = useLingui();
  return (phase, lockedBy) =>
    phase === 'boosted'
      ? {
          title: t({ id: 'monetize.boost.boosted', message: 'This trip is already boosted' }),
          line: t({
            id: 'monetize.boost.boostedLine',
            message: 'Unlimited redrafts, the live map and crews of 16 are on for everyone.',
          }),
        }
      : phase === 'ended'
        ? {
            title: t({ id: 'monetize.boost.ended', message: 'This trip is over' }),
            line: t({
              id: 'monetize.boost.endedLine',
              message: 'A boost only runs during a trip, so there is nothing to buy here.',
            }),
          }
        : phase === 'locked'
          ? {
              title:
                lockedBy === ''
                  ? t({ id: 'monetize.boost.locked', message: 'Someone is boosting this now' })
                  : t({
                      id: 'monetize.boost.lockedBy',
                      message: `${lockedBy} is boosting this now`,
                    }),
              line: t({
                id: 'monetize.boost.lockedLine',
                message: 'Only one of you can pay at a time. Check back in a few minutes.',
              }),
            }
          : phase === 'done'
            ? {
                title: t({ id: 'monetize.boost.done', message: 'Boosted' }),
                line: t({ id: 'monetize.boost.doneLine', message: 'It’s on for the whole crew.' }),
              }
            : null;
}
