/** Change a day (3c-11), the last free redraft (4f-3) and the redraft diff (3c-12), for the scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- scene names and fixture text, never copy. */
import type { RedraftReason } from '@cp/domain';

import { counterLine } from '../data/quota-copy';
import { changeCards, metricChips } from '../data/redraft';
import { DAYS, TZ } from '../scenes/fixtures';
import { CHANGES, METRICS, PLACES, SHIFT_CHANGES } from '../scenes/redraft-fixtures';
import { exitScene, InLocale, type DraftScene } from '../scenes/types';
import { DraftReviewView } from '../review/draft-review-view';
import { reviewProps } from '../review/scenes';
import { BoostOffer } from './boost-offer';
import { ChangeDayView, type ChangeDayViewProps } from './change-day-view';
import { LastRedraftView } from './last-redraft-interstitial';
import { RedraftDiffView, type DiffPhase } from './redraft-diff-view';

const noop = () => undefined;
const NOTE = 'Nara on a Monday sounds packed. Something near the ryokan?';

function changeDay(props: Partial<ChangeDayViewProps>) {
  const reasons = new Set<RedraftReason>(['less_train', 'swap_it_out']);
  return () => (
    <InLocale
      render={(locale) => (
        <>
          <DraftReviewView {...reviewProps(locale)} />
          <ChangeDayView
            guide="pon"
            destination="Kyoto"
            locale={locale}
            days={DAYS}
            day={4}
            onDay={noop}
            reasons={reasons}
            onReason={noop}
            note={NOTE}
            onNote={noop}
            problem={null}
            counter={counterLine({ used: 1, limit: 3 })}
            sending={false}
            spent={null}
            onSubmit={noop}
            onClose={exitScene}
            {...props}
          />
        </>
      )}
    />
  );
}

function diff(name: string, phase: DiffPhase, changes = CHANGES): DraftScene {
  return {
    name,
    render: () => (
      <InLocale
        render={(locale) => (
          <RedraftDiffView
            guide="pon"
            locale={locale}
            tz={TZ}
            phase={phase}
            dayNo={4}
            summary="Nara is out. The new day starts at the ryokan door and never gets on a train."
            cards={changeCards(changes, PLACES)}
            chips={metricChips(METRICS)}
            off={new Set()}
            baseTitle="Nara"
            sending={false}
            onToggle={noop}
            onKeep={noop}
            onPutBack={noop}
            onBack={noop}
            onBoost={undefined}
          />
        )}
      />
    ),
  };
}

export const REDRAFT_SCENES: readonly DraftScene[] = [
  { name: '3c-11-change-a-day', render: changeDay({}) },
  { name: 'change-day-no-reason', render: changeDay({ reasons: new Set(), note: '' }) },
  {
    name: 'change-day-spent',
    render: changeDay({
      counter: counterLine({ used: 3, limit: 3 }),
      spent: <BoostOffer onBoost={noop} />,
    }),
  },
  {
    name: 'change-day-conflict',
    render: changeDay({
      problem: 'Your draft changed since you opened this. Check the day and ask again.',
    }),
  },
  {
    name: '4f-3-last-redraft',
    render: () => (
      <InLocale
        render={(locale) => (
          <>
            <DraftReviewView {...reviewProps(locale)} />
            <LastRedraftView
              guide="pon"
              destination="Kyoto"
              n={3}
              limit={3}
              sending={false}
              problem={null}
              onUse={noop}
              onBoost={noop}
              onClose={exitScene}
            />
          </>
        )}
      />
    ),
  },
  diff('3c-12-redraft', 'ready'),
  diff('redraft-thinking', 'thinking'),
  diff('redraft-identical', 'identical'),
  diff('redraft-failed', 'failed'),
  diff('redraft-small-shifts', 'ready', SHIFT_CHANGES),
];
