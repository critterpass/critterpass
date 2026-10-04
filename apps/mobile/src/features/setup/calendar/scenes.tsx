/**
 * Fixed calendar scenes (developer tools and device screenshots): the connect sheet not yet
 * connected, synced two hours ago with Google switched on, and with access turned off; and the
 * by-hand grid with a week marked, opened on each of its Free / Maybe / Busy tools. Pure views
 * over fixed facts: no database, no native module.
 */
/* eslint-disable lingui/no-unlocalized-strings -- scene ids and fixture dates, never copy. */
import { useState } from 'react';

import { Scaffold } from '@/ui/surface/Scaffold';

import { SCENE_NOW } from '../scenes/fixtures';
import { exitScene, type SetupScene } from '../scenes/types';
import { CalendarConnectView, type CalendarConnectViewProps } from './calendar-connect-sheet';
import type { ManualMark, ManualMarks } from './manual-days';
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

const MARKS: ManualMarks = {
  '2026-10-05': 'free',
  '2026-10-06': 'free',
  '2026-10-07': 'busy',
  '2026-10-08': 'maybe',
  '2026-10-09': 'free',
};

/** The by-hand grid opened on one tool; painting works in the lab, nothing is saved. */
function Manual({ tool }: { readonly tool: ManualMark }) {
  const [marks, setMarks] = useState<ManualMarks>(MARKS);
  const [page, setPage] = useState(0);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']}>
      <ManualDaysView
        from="2026-10-02"
        to="2027-04-03"
        marks={marks}
        page={page}
        saving={false}
        onPage={setPage}
        onMarks={setMarks}
        onSave={noop}
        onDismiss={exitScene}
        initialTool={tool}
      />
    </Scaffold>
  );
}

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
  { name: 'calendar-manual-days', render: () => <Manual tool="free" /> },
  { name: 'calendar-manual-days-maybe', render: () => <Manual tool="maybe" /> },
  { name: 'calendar-manual-days-busy', render: () => <Manual tool="busy" /> },
];
