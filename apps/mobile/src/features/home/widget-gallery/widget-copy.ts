/**
 * The widget gallery's words: each widget's name and what it shows, and how to add one by hand
 * from the home screen (iOS has no way to add one from an app; some Android launchers refuse).
 */
import { useLingui } from '@lingui/react/macro';
import { Platform } from 'react-native';

import type { GalleryKind } from './gallery-rows';

export type WidgetCopy = Record<GalleryKind, { readonly title: string; readonly line: string }>;

export function useWidgetCopy(): WidgetCopy {
  const { t } = useLingui();
  return {
    countdown: {
      title: t({ id: 'home.widgets.countdown', message: 'Countdown' }),
      line: t({ id: 'home.widgets.countdownLine', message: 'Small · home and lock screen' }),
    },
    vote: {
      title: t({ id: 'home.widgets.vote', message: 'The vote' }),
      line: t({ id: 'home.widgets.voteLine', message: 'Medium · tap to vote' }),
    },
    today: {
      title: t({ id: 'home.widgets.today', message: 'Today' }),
      line: t({ id: 'home.widgets.todayLine', message: 'Large · the day’s plan and weather' }),
    },
    balances: {
      title: t({ id: 'home.widgets.balances', message: 'Balances' }),
      line: t({ id: 'home.widgets.balancesLine', message: 'Small · who owes who, and a nudge' }),
    },
    crew: {
      title: t({ id: 'home.widgets.crew', message: 'Crew, live' }),
      line: t({
        id: 'home.widgets.crewLine',
        message: 'Small or medium · everyone near the meet-up',
      }),
    },
    next_flight: {
      title: t({ id: 'home.widgets.nextFlight', message: 'Next flight' }),
      line: t({ id: 'home.widgets.nextFlightLine', message: 'Small · gate, seat, boarding time' }),
    },
    critterdex: {
      title: t({ id: 'home.widgets.critterdex', message: 'Critterdex' }),
      line: t({ id: 'home.widgets.critterdexLine', message: 'Small · the critters you’ve met' }),
    },
  };
}

export function useHowToSteps(widget: string): {
  readonly title: string;
  readonly steps: readonly string[];
} {
  const { t } = useLingui();
  const title = t({ id: 'home.widgets.howTo.title', message: 'Add it from your home screen' });
  const steps =
    Platform.OS === 'ios'
      ? [
          t({
            id: 'home.widgets.howTo.ios.hold',
            message: 'Touch and hold an empty spot on your home screen.',
          }),
          t({ id: 'home.widgets.howTo.ios.edit', message: 'Tap Edit, then Add Widget.' }),
          t({
            id: 'home.widgets.howTo.ios.pick',
            message: `Search CritterPass and pick ${widget}.`,
          }),
        ]
      : [
          t({
            id: 'home.widgets.howTo.android.hold',
            message: 'Touch and hold an empty spot on your home screen.',
          }),
          t({ id: 'home.widgets.howTo.android.widgets', message: 'Tap Widgets.' }),
          t({
            id: 'home.widgets.howTo.android.pick',
            message: `Find CritterPass and drag ${widget} into place.`,
          }),
        ];
  return { title, steps };
}
