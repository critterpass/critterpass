/**
 * Fixed calendar scenes (developer tools and device screenshots): the connect sheet not yet
 * connected, synced two hours ago with Google switched on, and with access turned off; and the
 * by-hand grid with a week marked. Pure views over fixed facts: no database, no native module.
 */
/* eslint-disable lingui/no-unlocalized-strings -- scene ids and fixture dates, never copy. */
import { Scaffold } from '@/ui/surface/Scaffold';

import { SCENE_NOW } from '../scenes/fixtures';
import { exitScene, type SetupScene } from '../scenes/types';
import { CalendarConnectView, type CalendarConnectViewProps } from './calendar-connect-sheet';
import { ManualDaysView } from './manual-days-sheet';

const noop = () => undefined;

function connect(overrides: Partial<CalendarConnectViewProps>) {
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']}>
      <CalendarConnectView
        status="needs_permission"
        lastSyncedAt={null}
        now={new Date(SCENE_NOW)}
        tentative={false}
        providers={[]}
        opening={null}
        oauthFailed={false}
        onConnect={noop}
        onSync={noop}
        onOpenSettings={noop}
        onTentative={noop}
        onProvider={noop}
        onMarkByHand={noop}
        onDismiss={exitScene}
        {...overrides}
      />
    </Scaffold>
  );
}

const MARKS = {
  '2026-10-05': 'free',
  '2026-10-06': 'free',
  '2026-10-07': 'busy',
  '2026-10-08': 'maybe',
  '2026-10-09': 'free',
} as const;

export const CALENDAR_SCENES: readonly SetupScene[] = [
  { name: 'calendar-connect', render: () => connect({}) },
  {
    name: 'calendar-connect-synced',
    render: () =>
      connect({
        status: 'synced',
        lastSyncedAt: new Date(SCENE_NOW - 2 * 3_600_000),
        tentative: true,
        providers: ['google', 'microsoft'],
      }),
  },
  { name: 'calendar-connect-denied', render: () => connect({ status: 'denied' }) },
  {
    name: 'calendar-manual-days',
    render: () => (
      <Scaffold variant="dark" edges={['top', 'bottom']}>
        <ManualDaysView
          from="2026-10-02"
          to="2027-04-03"
          marks={MARKS}
          page={0}
          saving={false}
          onPage={noop}
          onToggle={noop}
          onSave={noop}
          onDismiss={exitScene}
        />
      </Scaffold>
    ),
  },
];
