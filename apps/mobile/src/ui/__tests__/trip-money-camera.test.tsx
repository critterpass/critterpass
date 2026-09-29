// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { PayMethodChips } from '../money/PayMethodChips';
import { SettleRow } from '../money/SettleRow';
import { renderUi } from '../test-support/render';
import { EmergencyTiles } from '../trip/EmergencyTiles';
import { ImportTiles } from '../trip/ImportTiles';
import { PackingChips } from '../trip/PackingChips';
import { ParsedBookingCard } from '../trip/ParsedBookingCard';
import { PhraseCard } from '../trip/PhraseCard';
import { SupplierCard } from '../trip/SupplierCard';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
const noop = () => undefined;

describe('trip day', () => {
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

describe('camera', () => {});

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
});
