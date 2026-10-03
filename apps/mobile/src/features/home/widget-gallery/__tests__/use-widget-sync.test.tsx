/**
 * The session's widget refresh: once at launch, again on a return to the foreground only after
 * fifteen minutes, nothing at all in a binary without the App Group module, and the placed
 * widgets go to the server through the command queue.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import {
  LocalFirstContext,
  type LocalFirstContextValue,
} from '../../../../data/powersync/local-first-context';
import { useWidgetSync, WIDGET_FOREGROUND_REFRESH_MS } from '../use-widget-sync';
import type { WidgetPorts } from '../widget-ports';
import type { WidgetSnapshotFetch } from '../widget-snapshot-sync';

const body = JSON.parse(
  readFileSync(
    path.resolve(__dirname, '../../../../../targets/_shared/Snapshot/Tests/Fixtures/widgets.json'),
    'utf8',
  ),
) as Record<string, unknown>;

function session() {
  const send = jest.fn(() => Promise.resolve({ kind: 'queued', opId: 'op' }));
  const value = { commands: { send } } as unknown as LocalFirstContextValue;
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <LocalFirstContext.Provider value={value}>{children}</LocalFirstContext.Provider>
  );
  return { send, wrapper };
}

const settle = () => act(() => new Promise((resolve) => setImmediate(resolve)));

describe('useWidgetSync', () => {
  it('refreshes at launch, then on a return to the foreground once fifteen minutes have passed', async () => {
    const { send, wrapper } = session();
    const fetches = jest.fn<() => Promise<WidgetSnapshotFetch>>(() =>
      Promise.resolve({ kind: 'ok', body }),
    );
    const writes: string[] = [];
    const ports: WidgetPorts = {
      sink: { writeSnapshot: (key) => void writes.push(key), reloadWidgets: () => undefined },
      installed: () => Promise.resolve([{ kind: 'CPVoteWidget', family: 'system_medium' }]),
    };
    let clock = 1_000_000;
    let onChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onChange = listener as (state: string) => void;
      return { remove: () => undefined };
    });
    function Probe() {
      useWidgetSync(ports, fetches, () => clock);
      return null;
    }
    await render(<Probe />, { wrapper });
    await settle();
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(writes).toEqual(['widgets', 'entitlements']);
    expect(send).toHaveBeenCalledWith(
      { name: 'sync_installed_widgets', offline: true },
      { widgets: [{ kind: 'vote', family: 'system_medium' }] },
      undefined,
    );
    clock += WIDGET_FOREGROUND_REFRESH_MS - 1;
    onChange?.('active');
    await settle();
    expect(fetches).toHaveBeenCalledTimes(1);
    clock += 1;
    onChange?.('active');
    await settle();
    expect(fetches).toHaveBeenCalledTimes(2);
  });

  it('does nothing in a binary without the App Group module', async () => {
    const { send, wrapper } = session();
    const fetches = jest.fn<() => Promise<WidgetSnapshotFetch>>();
    function Probe() {
      useWidgetSync(null, fetches);
      return null;
    }
    await render(<Probe />, { wrapper });
    await settle();
    expect(fetches).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
