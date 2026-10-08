import { act, fireEvent, screen } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  PERMISSION_KINDS,
  type PermissionKind,
  applyPermissionsSnapshot,
  configurePermissions,
  createPermissionStore,
  type KeyValueStorage,
  type PermissionReport,
  type RequestLevel,
} from '@/lib/permissions';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { renderUi } from '../../test-support/render';
import { PermissionsPrimer } from '../PermissionsPrimer';
import { PermissionsSection } from '../PermissionsSection';
import { PrimerSheetHost } from '../PrimerSheetHost';
import { requestWithPrimer } from '@/lib/permissions';

import '../permission-primer.fixtures';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => data.delete(key),
  };
}

const base = (kind: PermissionKind): PermissionReport => ({
  kind,
  status: 'not_determined',
  canAskAgain: true,
  available: true,
});

/** The OS behind the native module: current answers and what each prompt answers. */
let os: Map<PermissionKind, PermissionReport>;
let answers: Partial<Record<PermissionKind, PermissionReport>>;
let prompts: [PermissionKind, RequestLevel | undefined][];
let opened: string[];

function wire() {
  configurePermissions({
    port: {
      getStatus: (kind) => Promise.resolve(os.get(kind) ?? base(kind)),
      request(kind, level) {
        prompts.push([kind, level]);
        const next = answers[kind] ?? os.get(kind) ?? base(kind);
        os.set(kind, next);
        return Promise.resolve(next);
      },
      openSettings(target) {
        opened.push(target);
        return Promise.resolve(true);
      },
      settingsTargetFor: (kind) => (kind === 'notifications' ? 'notifications' : 'app'),
    },
    sendMirror: () => Promise.resolve(),
    storage: memoryStorage(),
    store: createPermissionStore(memoryStorage()),
  });
}

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// The primer is a screen root (Scaffold), which reads the app root's screen-jolt provider.
const renderWithInsets = (ui: ReactElement) =>
  renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{ui}</ScreenJoltProvider>
    </SafeAreaProvider>,
  );

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

beforeEach(() => {
  os = new Map(PERMISSION_KINDS.map((kind) => [kind, base(kind)]));
  answers = {};
  prompts = [];
  opened = [];
  wire();
});

describe('3a-9 permissions primer', () => {
  it('starts with every toggle off and asks the OS only when one is flipped on', async () => {
    answers.notifications = { ...base('notifications'), status: 'granted', canAskAgain: false };
    await renderWithInsets(
      <PermissionsPrimer guide="tokek" guideName="Tokek" onDone={jest.fn()} onLater={jest.fn()} />,
    );
    for (const kind of ['notifications', 'location', 'calendar']) {
      expect(screen.getByTestId(`primer-${kind}-toggle`).props.accessibilityState).toMatchObject({
        checked: false,
      });
    }
    expect(prompts).toEqual([]);
    await fireEvent.press(screen.getByTestId('primer-notifications-toggle'));
    expect(prompts).toEqual([['notifications', undefined]]);
    expect(
      screen.getByTestId('primer-notifications-toggle').props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
  });

  it('snaps back and offers Settings when the OS refuses', async () => {
    answers.location = { ...base('location'), status: 'denied', canAskAgain: false, level: 'none' };
    await renderWithInsets(
      <PermissionsPrimer guide="tokek" guideName="Tokek" onDone={jest.fn()} onLater={jest.fn()} />,
    );
    await fireEvent.press(screen.getByTestId('primer-location-toggle'));
    expect(screen.getByTestId('primer-location-toggle').props.accessibilityState).toMatchObject({
      checked: false,
    });
    await fireEvent.press(screen.getByTestId('primer-location-denied-action'));
    expect(opened).toEqual(['app']);
  });

  it('really asks later: "Ask me later" asks nothing', async () => {
    const onLater = jest.fn();
    await renderWithInsets(
      <PermissionsPrimer guide="tokek" guideName="Tokek" onDone={jest.fn()} onLater={onLater} />,
    );
    await activate(screen.getByRole('button', { name: 'Ask me later' }));
    expect(onLater).toHaveBeenCalled();
    expect(prompts).toEqual([]);
  });
});

describe('just-in-time primer sheet', () => {
  it('shows the sheet first and prompts only after "Turn on"', async () => {
    answers.camera = { ...base('camera'), status: 'granted', canAskAgain: false };
    await renderWithInsets(<PrimerSheetHost />);
    let outcome: Promise<unknown> = Promise.resolve();
    await act(() => {
      outcome = requestWithPrimer('camera', 'real_photo');
    });
    expect(screen.getByTestId('primer-sheet')).toBeTruthy();
    expect(prompts).toEqual([]);
    await fireEvent.press(screen.getByTestId('primer-sheet-accept'));
    await expect(outcome).resolves.toMatchObject({ result: 'granted' });
    expect(prompts).toEqual([['camera', undefined]]);
    expect(screen.queryByTestId('primer-sheet')).toBeNull();
  });

  it('counts "Not now" as declined without any OS prompt', async () => {
    await renderWithInsets(<PrimerSheetHost />);
    let outcome: Promise<unknown> = Promise.resolve();
    await act(() => {
      outcome = requestWithPrimer('calendar', 'date_finding');
    });
    await fireEvent.press(screen.getByTestId('primer-sheet-decline'));
    await expect(outcome).resolves.toEqual({ result: 'declined' });
    expect(prompts).toEqual([]);
  });
});

describe('Android background location disclosure', () => {
  it('shows the prominent disclosure before the Always step, and only then prompts', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      os.set('location', { ...base('location'), status: 'granted', level: 'wiu' });
      answers.location = { ...base('location'), status: 'granted', level: 'always' };
      await renderWithInsets(<PrimerSheetHost />);
      let outcome: Promise<unknown> = Promise.resolve();
      await act(() => {
        outcome = requestWithPrimer('location', 'always_upgrade', { level: 'always' });
      });
      expect(screen.getByTestId('background-location-disclosure')).toBeTruthy();
      expect(prompts).toEqual([]);
      await fireEvent.press(screen.getByTestId('background-location-disclosure-continue'));
      await expect(outcome).resolves.toMatchObject({ result: 'granted' });
      expect(prompts).toEqual([['location', 'always']]);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});

describe('Settings permissions section', () => {
  it('lists each kind with its state and fixes a refused one through Settings', async () => {
    os.set('camera', { ...base('camera'), status: 'denied', canAskAgain: false });
    os.set('location', { ...base('location'), status: 'granted', level: 'wiu', precise: false });
    await act(async () => {
      await applyPermissionsSnapshot({
        reports: Object.fromEntries(os) as Record<PermissionKind, PermissionReport>,
        alarms: { exactAlarm: false, fullScreenIntent: true },
        liveActivities: null,
      });
    });
    await renderWithInsets(<PermissionsSection />);
    expect(screen.getByText(/Approximate only/)).toBeTruthy();
    expect(screen.getByText(/Leave-by falls back to a loud notification/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Camera'));
    expect(opened).toEqual(['app']);
  });
});
