/**
 * The just-in-time primer: the sheet shows first and the OS asks only after "Turn on"; "Not now"
 * declines without a prompt; Android shows the background location disclosure first.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  PERMISSION_KINDS,
  type PermissionKind,
  configurePermissions,
  createPermissionStore,
  type KeyValueStorage,
  type PermissionReport,
  type RequestLevel,
} from '@/lib/permissions';

import { renderUi } from '@/lib/test-support/render-ui';

import { PrimerSheetHost } from '../primer-sheet-host';
import { requestWithPrimer } from '@/lib/permissions';

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

const renderWithInsets = (ui: ReactElement) =>
  renderUi(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

beforeEach(() => {
  os = new Map(PERMISSION_KINDS.map((kind) => [kind, base(kind)]));
  answers = {};
  prompts = [];
  opened = [];
  wire();
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
