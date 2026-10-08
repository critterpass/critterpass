import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { PayMethodChips } from '../money/PayMethodChips';
import { SettleRow } from '../money/SettleRow';
import { renderUi } from '../test-support/render';
import { EmergencyTiles } from '../trip/EmergencyTiles';
import { PhraseCard } from '../trip/PhraseCard';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
const noop = () => undefined;

describe('trip day', () => {
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
