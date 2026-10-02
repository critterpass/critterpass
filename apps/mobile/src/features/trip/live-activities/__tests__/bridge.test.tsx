/**
 * The registration hook inside a session: without the Live Activity module (builds before it,
 * Android, web) it subscribes to nothing and sends no command; with it, a push-to-start token goes
 * out once through the command queue.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  LocalFirstContext,
  type LocalFirstContextValue,
} from '../../../../data/powersync/local-first-context';
import { drawsCrewLive, useLiveActivityRegistration } from '../bridge';
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

function WithModule({ port }: { readonly port: LaPort }) {
  useLiveActivityRegistration(port);
  return null;
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
    const none = () => ({ remove: () => undefined });
    const port: LaPort = {
      authorization: () => ({ enabled: true, frequent: false }),
      drawnKinds: () => null,
      onPushToStartToken: (listener) => (listeners.push(listener), none()),
      onUpdateToken: none,
      onActivityState: none,
    };
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

  it('offers the crew lock screen only in a build that draws the crew-live activity', () => {
    const says = (kinds: readonly string[] | null) => drawsCrewLive({ drawnKinds: () => kinds });
    expect(drawsCrewLive(null)).toBe(false);
    // Builds from before the kinds were reported, and builds that draw only the first two.
    expect(says(null)).toBe(false);
    expect(says(['leave_by', 'flight'])).toBe(false);
    expect(says(['leave_by', 'flight', 'meet_up'])).toBe(true);
  });
});
