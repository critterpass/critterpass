// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// The tracker is drawn outside a route tree here: it is the focused screen.
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import type { CrewPerson, RsvpStatus } from '../data/trip';
import { lockCopy, trackerLine, trackerName } from '../labels';
import { lockState, publicStatus, tally } from '../tracker/model';
import { TrackerView } from '../tracker/tracker-view';

const noop = () => undefined;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const person = (uid: string, rsvp: RsvpStatus, organiser = false): CrewPerson => ({
  uid,
  name: uid,
  fullName: uid,
  joinIndex: organiser ? 0 : 1,
  organiser,
  rsvp,
  repliedAt: '2026-10-02T07:08:00.000Z',
});

/** The tracker as the screen builds it, for a sent proposal and this crew. */
const tracker = (people: readonly CrewPerson[]) => {
  const copy = lockCopy(
    lockState(
      'sent',
      people.filter((p) => !p.organiser),
    ),
  );
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>
        <TrackerView
          back="Lisbon proposal"
          chip={null}
          rows={people.map((p) => ({
            uid: p.uid,
            name: trackerName(p, p.organiser),
            joinIndex: p.joinIndex,
            status: publicStatus(p),
            line: trackerLine('en', p, '2026-10-02T06:00:00.000Z'),
          }))}
          tally={tally(people)}
          suggestions={null}
          lockLabel={copy.label}
          lockNote={copy.note}
          locking={false}
          onBack={noop}
          onLock={noop}
        />
      </ScreenJoltProvider>
    </SafeAreaProvider>
  );
};

describe('the tracker once everyone else is out', () => {
  it('offers the organiser the lock on their own', async () => {
    await renderUi(tracker([person('Khanh', 'in', true), person('Linh', 'out')]));
    expect(screen.getByTestId('tracker-lock')).toBeTruthy();
    expect(screen.queryByText(/once someone says they’re in/)).toBeNull();
  });

  it('still waits for an answer while someone has not replied', async () => {
    await renderUi(
      tracker([person('Khanh', 'in', true), person('Linh', 'out'), person('Minh', 'unopened')]),
    );
    expect(screen.queryByTestId('tracker-lock')).toBeNull();
    expect(screen.getByText(/once someone says they’re in/)).toBeTruthy();
  });
});
