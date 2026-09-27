// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { makeMutable } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { ArLabels } from '../camera/ArLabels';
import { ScanOverlay } from '../camera/ScanOverlay';
import { Viewfinder } from '../camera/Viewfinder';
import { VoiceOrb } from '../camera/VoiceOrb';
import { fixturesFor } from '../gallery/registry';
import { PayMethodChips } from '../money/PayMethodChips';
import { SettleRow } from '../money/SettleRow';
import { renderUi } from '../test-support/render';
import { CrewRail } from '../trip/CrewRail';
import { EmergencyTiles } from '../trip/EmergencyTiles';
import { EtaList } from '../trip/EtaList';
import { ImportTiles } from '../trip/ImportTiles';
import { LeaveByHero } from '../trip/LeaveByHero';
import { PackingChips } from '../trip/PackingChips';
import { ParsedBookingCard } from '../trip/ParsedBookingCard';
import { PhraseCard } from '../trip/PhraseCard';
import { SupplierCard } from '../trip/SupplierCard';
import { TimelineList } from '../trip/TimelineList';
import { WatchRow } from '../trip/WatchRow';

import '../camera/camera.fixtures';
import '../money/money.fixtures';
import '../trip/trip.fixtures';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
const noop = () => undefined;

describe('trip day', () => {
  it('reads ETAs, the crew rail and the timeline as sentences', async () => {
    await renderUi(
      <>
        <EtaList
          entries={[
            { id: 'm', name: 'Maya', status: 'Leaving the spa', eta: '16:52' },
            { id: 'd', name: 'Dev', status: 'Paused sharing' },
          ]}
        />
        <CrewRail
          destination="Campuhan Ridge"
          members={[{ id: 'j', name: 'Jordan', progress: 0.4, etaLabel: '8 min', avatar: null }]}
        />
        <TimelineList items={[{ id: '1', time: '06:10', title: 'Sunrise', detail: '2h climb' }]} />
      </>,
    );
    expect(screen.getByLabelText('Maya, Leaving the spa, arrives 16:52')).toBeTruthy();
    expect(screen.getByLabelText('Dev, Paused sharing')).toBeTruthy();
    expect(screen.getByLabelText('Campuhan Ridge; Jordan, 8 min')).toBeTruthy();
    expect(screen.getByLabelText('06:10, Sunrise, 2h climb')).toBeTruthy();
  });

  it('speaks the leave-by time instead of the decorative mega numerals', async () => {
    await renderUi(
      <LeaveByHero
        eyebrow="Day 4"
        label="Leave by"
        time="03:10"
        spokenTime="3:10 AM"
        ring={{ progress: 0.5, value: '21:29', caption: 'to go', spoken: '21 minutes to go' }}
        crewLabel="4 of 6 are up"
      />,
    );
    expect(screen.getByRole('header', { name: 'Leave by 3:10 AM' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '21 minutes to go' })).toBeTruthy();
  });

  it('toggles packing items as checkboxes', async () => {
    const onToggle = jest.fn();
    await renderUi(
      <PackingChips
        onToggle={onToggle}
        items={[
          { id: 'lamp', label: 'Headlamp', packed: true },
          { id: 'shoes', label: 'Trail shoes', packed: false },
        ]}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Headlamp' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await run(screen.getByRole('checkbox', { name: 'Trail shoes' }), 'activate');
    expect(onToggle).toHaveBeenCalledWith('shoes');
  });

  it('marks phrase language for pronunciation and plays it', async () => {
    const onPlay = jest.fn();
    await renderUi(
      <PhraseCard
        phrase="Saya butuh dokter."
        lang="id"
        translation="I need a doctor."
        onPlay={onPlay}
      />,
    );
    expect(screen.getByText('Saya butuh dokter.').props.accessibilityLanguage).toBe('id');
    await run(screen.getByRole('button', { name: 'Read aloud' }), 'activate');
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('calls numbers and opens problem tiles', async () => {
    const onCall = jest.fn();
    const onHurt = jest.fn();
    await renderUi(
      <EmergencyTiles
        primary={{ number: '112', label: 'Ambulance, police, fire', onCall }}
        problems={[{ id: 'hurt', label: 'Hurt or sick', onPress: onHurt }]}
        clinic={{ name: 'BIMC Ubud', detail: '9 min', actionLabel: 'Go', onGo: noop }}
      />,
    );
    await run(
      screen.getByRole('button', { name: 'Call 112, Ambulance, police, fire' }),
      'activate',
    );
    await run(screen.getByRole('button', { name: 'Hurt or sick' }), 'activate');
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(onHurt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Go, BIMC Ubud' })).toBeTruthy();
  });

  it('pairs watch status colour with its word', async () => {
    await renderUi(
      <WatchRow
        icon={null}
        title="Rough seas"
        detail="Boats might not run"
        status="Plan B"
        tone="urgent"
      />,
    );
    expect(screen.getByLabelText('Plan B, Rough seas, Boats might not run')).toBeTruthy();
  });

  it('copies the forwarding address and adds a parsed booking with its split switch', async () => {
    const onCopy = jest.fn();
    const onToggle = jest.fn();
    const onAdd = jest.fn();
    await renderUi(
      <>
        <ImportTiles
          sources={[
            {
              id: 'f',
              label: 'Forward',
              detail: 'Any email',
              color: tokens.color.yellow,
              onPress: noop,
            },
          ]}
          address={{ value: 'six@in.critterpass.app', onCopy }}
        />
        <ParsedBookingCard
          title="Fast boat"
          fields={['Fri', '$228']}
          source="From Alex's email"
          split={{ label: 'Split 6 ways', on: true, onToggle }}
          addLabel="Add"
          onAdd={onAdd}
        />
      </>,
    );
    await run(screen.getByRole('button', { name: 'Copy six@in.critterpass.app' }), 'activate');
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Fast boat, Fri, $228, From Alex's email")).toBeTruthy();
    const split = screen.getByRole('switch', { name: 'Split 6 ways' });
    expect(split.props.accessibilityState).toMatchObject({ checked: true });
    await run(split, 'activate');
    await run(screen.getByRole('button', { name: 'Add, Fast boat' }), 'activate');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders supplier values verbatim with attribution', async () => {
    await renderUi(
      <SupplierCard
        title="Batur sunrise trek"
        price="US$ 42.50"
        fields={[{ label: 'Pickup', value: 'Ubud hotels, 02:00-02:30' }]}
        attribution="Prices from Klook"
      />,
    );
    expect(screen.getByText('Ubud hotels, 02:00-02:30')).toBeTruthy();
    expect(screen.getByText('US$ 42.50')).toBeTruthy();
    expect(screen.getByText('Prices from Klook')).toBeTruthy();
  });
});

describe('money', () => {
  it('reads a settle row and nudges', async () => {
    const onNudge = jest.fn();
    await renderUi(
      <SettleRow
        from={{ name: 'Jordan', avatar: null }}
        to={{ name: 'Winston', avatar: null }}
        amount="$92.10"
        status="requested"
        statusLabel="Requested"
        onNudge={onNudge}
      />,
    );
    expect(screen.getByLabelText('Jordan pays Winston $92.10, Requested')).toBeTruthy();
    await run(screen.getByRole('button', { name: 'Nudge Jordan' }), 'activate');
    expect(onNudge).toHaveBeenCalledTimes(1);
  });

  it('toggles accepted pay methods', async () => {
    const onToggle = jest.fn();
    await renderUi(
      <PayMethodChips
        methods={[
          { id: 'bank', label: 'Bank transfer' },
          { id: 'cash', label: 'Cash' },
        ]}
        selected={['bank']}
        onToggle={onToggle}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Bank transfer' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await run(screen.getByRole('checkbox', { name: 'Cash' }), 'activate');
    expect(onToggle).toHaveBeenCalledWith('cash');
  });
});

describe('camera', () => {
  it('labels the viewfinder, scan progress, AR translations and the voice orb state', async () => {
    await renderUi(
      <>
        <Viewfinder
          accessibilityLabel="Camera"
          context="You're at Tirta Empul"
          mode="Encounter"
          pinging
        />
        <ScanOverlay scanning lines={[{ id: '1', top: 0.2, height: 0.05 }]} />
        <ArLabels
          labels={[
            {
              id: 'g',
              x: 0.1,
              y: 0.1,
              source: 'Gado-gado',
              text: 'Veg, peanut sauce',
              notes: [{ label: 'Alex ✕ peanuts', clash: true }],
            },
          ]}
        />
        <VoiceOrb
          level={makeMutable(0.5)}
          sticker={null}
          state="listening"
          stateLabel="Listening"
          transcript="What now?"
        />
      </>,
    );
    expect(screen.getByRole('image', { name: "Camera, You're at Tirta Empul" })).toBeTruthy();
    expect(
      screen.getByRole('image', { name: 'Scanning, 1 lines read' }).props.accessibilityState,
    ).toEqual({ busy: true });
    expect(screen.getByLabelText('Gado-gado: Veg, peanut sauce, Alex ✕ peanuts')).toBeTruthy();
    expect(screen.getByText('LISTENING')).toBeTruthy();
    expect(screen.getByText('“What now?”')).toBeTruthy();
  });
});

describe('trip, money and camera boundaries', () => {
  it('stays presentational: no feature or data imports', () => {
    for (const dir of ['trip', 'money', 'camera']) {
      const root = join(__dirname, '..', dir);
      for (const file of readdirSync(root)) {
        const source = readFileSync(join(root, file), 'utf8');
        expect(source).not.toMatch(/from '@\/features|from '@cp\/(db|sync|api)/);
      }
    }
  });

  it('registers and renders every fixture', async () => {
    const components = [
      'EtaList',
      'CrewRail',
      'LeaveByHero',
      'PackingChips',
      'TimelineList',
      'PhraseCard',
      'EmergencyTiles',
      'WatchRow',
      'ImportTiles',
      'ParsedBookingCard',
      'SupplierCard',
      'SettleRow',
      'PayMethodChips',
      'Viewfinder',
      'ScanOverlay',
      'ArLabels',
      'VoiceOrb',
    ];
    for (const component of components) {
      const fixtures = fixturesFor(component);
      expect(fixtures.length).toBeGreaterThan(0);
      for (const fixture of fixtures) {
        const { unmount } = await renderUi(<>{fixture.render()}</>);
        await unmount();
      }
    }
  });
});
