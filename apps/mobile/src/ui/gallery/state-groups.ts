/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery labels; only the (dev) gallery reads this module. */

/** One gallery fixture, by component and state name. */
export interface FixtureRef {
  readonly component: string;
  readonly state: string;
}

/** One screen state of a state group, shown as the fixtures that compose it. */
export interface GroupState {
  /** Design screen id, e.g. `3b-1`. */
  readonly screen: string;
  readonly label: string;
  readonly fixtures: readonly FixtureRef[];
}

export interface StateGroup {
  readonly title: string;
  readonly states: readonly GroupState[];
}

const f = (component: string, state: string): FixtureRef => ({ component, state });

/**
 * The prototype's twelve state groups: one route that switches between several designed states
 * (plans/reports design-system-prototype §1.5). The gallery previews each state as the component
 * fixtures its screen composes, so a reviewer can flip between the states of one screen.
 */
export const STATE_GROUPS: readonly StateGroup[] = [
  {
    title: 'Home',
    states: [
      {
        screen: '3b-1',
        label: 'first run',
        fixtures: [f('HomeHeader', 'all caught up'), f('EmptyState', 'no trips yet')],
      },
      {
        screen: '3b-2',
        label: 'trip coming up',
        fixtures: [
          f('HomeHeader', 'unread chat and inbox'),
          f('CountdownCard', 'next trip'),
          f('ActionCard', 'slides off when handled'),
        ],
      },
      {
        screen: '3b-6',
        label: 'final vote',
        fixtures: [f('HomeHeader', 'unread chat and inbox')],
      },
    ],
  },
  {
    title: 'Inbox',
    states: [
      {
        screen: '3b-4',
        label: 'inbox',
        fixtures: [f('ActionCard', 'slides off when handled')],
      },
      {
        screen: '3b-5',
        label: 'all caught up',
        fixtures: [f('HomeHeader', 'all caught up'), f('GuideLine', 'plain and bubble')],
      },
    ],
  },
  {
    title: 'Destination vote',
    states: [
      {
        screen: '3c-2',
        label: 'Kyoto wins',
        fixtures: [f('ResultTally', 'Kyoto wins'), f('PollBars', 'final vote')],
      },
    ],
  },
  {
    title: 'When',
    states: [
      {
        screen: '3c-4',
        label: 'no week fits',
        fixtures: [f('RadioCard', 'with pick tag')],
      },
    ],
  },
  {
    title: 'Draft',
    states: [
      {
        screen: '3c-9',
        label: 'the draft',
        fixtures: [f('DayRow', 'booked'), f('DayRow', 'reorderable'), f('ActionPill', 'tones')],
      },
    ],
  },
  {
    title: "Who's in",
    states: [
      {
        screen: '3f-6',
        label: "who's in",
        fixtures: [f('AvatarStack', 'overflow'), f('EmptySeat', 'invite')],
      },
      {
        screen: '3f-7',
        label: 'one drops out',
        fixtures: [f('AvatarStack', 'overflow')],
      },
    ],
  },
  {
    title: 'Receipt scan',
    states: [
      {
        screen: '3i-4',
        label: "couldn't read it",
        fixtures: [f('ErrorSheet', 'three ways forward')],
      },
    ],
  },
  {
    title: 'Guide modes',
    states: [
      {
        screen: '3j-1',
        label: 'chat',
        fixtures: [f('ChatMessage', 'thread'), f('Composer', 'idle and typing')],
      },
      {
        screen: '3j-3',
        label: 'point and ask',
        fixtures: [f('PhraseCard', 'show to driver')],
      },
    ],
  },
  {
    title: 'Trip hub',
    states: [
      {
        screen: '3k-1',
        label: 'hub',
        fixtures: [f('TileGrid', 'hub 2×2')],
      },
      {
        screen: '3k-5',
        label: 'flight delayed',
        fixtures: [f('SplitFlap', 'gate change'), f('StaleCaption', 'hours old')],
      },
    ],
  },
  {
    title: 'Day-of',
    states: [
      {
        screen: '3k-2',
        label: 'leave by',
        fixtures: [f('LeaveByHero', 'sunrise climb')],
      },
      {
        screen: '3k-3',
        label: 'lock screen',
        fixtures: [f('Ticket', 'flight')],
      },
      {
        screen: '3k-4',
        label: 'offline at the top',
        fixtures: [f('OfflinePill', 'no signal')],
      },
    ],
  },
  {
    title: 'Encounter',
    states: [
      {
        screen: '3l-4',
        label: 'encounter',
        fixtures: [f('EncounterCard', 'rare encounter'), f('HoldRing', 'green, gold, pink')],
      },
      {
        screen: '3l-5',
        label: 'it wandered off',
        fixtures: [f('WanderFootprints', 'wandered off')],
      },
    ],
  },
  {
    title: 'Pass documents',
    states: [
      {
        screen: '4a-1',
        label: 'visa page',
        fixtures: [f('PaperChrome', 'visa page'), f('VisaPaywall', 'go further than free')],
      },
      {
        screen: '4a-2',
        label: 'boarding pass',
        fixtures: [f('Ticket', 'crew boarding pass (3f-5)')],
      },
      {
        screen: '4a-3',
        label: 'gold cover',
        fixtures: [f('PassportCover', 'ink and gold')],
      },
    ],
  },
];
