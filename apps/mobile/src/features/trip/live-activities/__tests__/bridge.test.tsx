/**
 * The registration hook inside a session: without the Live Activity module (builds before it,
 * Android, web) it subscribes to nothing and sends no command; with it, a push-to-start token goes
 * out once through the command queue, and an encounter filling its ring starts the critter-nearby
 * activity.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import {
  LocalFirstContext,
  type LocalFirstContextValue,
} from '../../../../data/powersync/local-first-context';
import { drawsCrewLive, useLiveActivityRegistration } from '../bridge';
import type { NearbySnapshot } from '../critter-nearby';
import type { LaPort } from '../la-port';

function session() {
  const send = jest.fn(() => Promise.resolve({ kind: 'queued', opId: 'op' }));
  const value = { commands: { send } } as unknown as LocalFirstContextValue;
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <LocalFirstContext.Provider value={value}>{children}</LocalFirstContext.Provider>
  );
  return { send, wrapper };
}

function InstalledModule() {
  useLiveActivityRegistration();
  return null;
}

const NOTHING_NEARBY: NearbySnapshot = { phase: 'none', progress: 0, band: null, candidate: null };

function WithModule({
  port,
  nearby = NOTHING_NEARBY,
}: {
  readonly port: LaPort;
  readonly nearby?: NearbySnapshot;
}) {
  const [encounters] = useState(() => () => ({
    snapshot: () => nearby,
    subscribe: () => () => undefined,
  }));
  useLiveActivityRegistration(port, encounters);
  return null;
}

const none = () => ({ remove: () => undefined });

function modulePort(overrides: Partial<LaPort> = {}): LaPort {
  return {
    authorization: () => ({ enabled: true, frequent: false }),
    drawnKinds: () => null,
    start: () => Promise.resolve('activity'),
    update: () => Promise.resolve(),
    end: () => Promise.resolve(),
    list: () => [],
    onPushToStartToken: none,
    onUpdateToken: none,
    onActivityState: none,
    ...overrides,
  };
}

describe('useLiveActivityRegistration', () => {
  it('sends nothing in a binary without the native module', async () => {
    const { send, wrapper } = session();
    await render(<InstalledModule />, { wrapper });
    await new Promise((resolve) => setImmediate(resolve));
    expect(send).not.toHaveBeenCalled();
  });

  it('queues a push-to-start token the module reports', async () => {
    const { send, wrapper } = session();
    const listeners: ((event: { kind: string; token: string }) => void)[] = [];
    const port = modulePort({
      onPushToStartToken: (listener) => (listeners.push(listener), none()),
    });
    await render(<WithModule port={port} />, { wrapper });
    listeners.forEach((listener) => listener({ kind: 'flight', token: 'ab'.repeat(32) }));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([
      { name: 'register_la_token', offline: true },
      { kind: 'push_to_start', activity_type: 'flight', token: 'ab'.repeat(32), apns_env: 'prod' },
      undefined,
    ]);
  });

  it('starts the critter-nearby activity while an encounter fills its ring', async () => {
    const { wrapper } = session();
    const start = jest.fn<LaPort['start']>(() => Promise.resolve('activity'));
    const port = modulePort({ drawnKinds: () => ['leave_by', 'critter_nearby'], start });
    const nearby: NearbySnapshot = {
      phase: 'accruing',
      progress: 0.5,
      band: '10_25',
      candidate: {
        rule: { id: '0199a3c0-0000-7000-8000-00000000e001', form_id: 'gecko-tokek', dwell_s: 600 },
        spot: { name: 'Tirta Empul' },
      },
    };
    await render(<WithModule port={port} nearby={nearby} />, { wrapper });
    await new Promise((resolve) => setImmediate(resolve));
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      kind: 'critter_nearby',
      attributes: { place_name: 'Tirta Empul' },
      state: { state: 'dwelling', ring: 5, distance_band: 'close', remain_min: 5 },
    });
  });

  it('offers the crew lock screen only in a build that draws the crew-live activity', () => {
    const says = (kinds: readonly string[] | null) => drawsCrewLive({ drawnKinds: () => kinds });
    expect(drawsCrewLive(null)).toBe(false);
    // Builds from before the kinds were reported, and builds that draw only the first two.
    expect(says(null)).toBe(false);
    expect(says(['leave_by', 'flight'])).toBe(false);
    expect(says(['leave_by', 'flight', 'meet_up'])).toBe(true);
  });
});
