import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { attachAppStatePolicy, BACKGROUND_DISCONNECT_MS } from '../client';
import { lifecycle } from '../test-support/lifecycle';

function connection() {
  const calls: string[] = [];
  return {
    calls,
    connect: () => calls.push('connect'),
    disconnect: () => calls.push('disconnect'),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('attachAppStatePolicy', () => {
  it('disconnects 30 s after going to the background and reconnects on return', () => {
    const app = lifecycle();
    const socket = connection();
    attachAppStatePolicy(socket, app);

    app.emit('background');
    jest.advanceTimersByTime(BACKGROUND_DISCONNECT_MS - 1);
    expect(socket.calls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(BACKGROUND_DISCONNECT_MS).toBe(30_000);
    expect(socket.calls).toEqual(['disconnect']);

    jest.advanceTimersByTime(90_000);
    app.emit('active');
    expect(socket.calls).toEqual(['disconnect', 'connect']);
  });

  it('keeps the connection through a short trip to the background or an inactive glance', () => {
    const app = lifecycle();
    const socket = connection();
    attachAppStatePolicy(socket, app);
    app.emit('inactive');
    jest.advanceTimersByTime(60_000);
    app.emit('background');
    jest.advanceTimersByTime(29_000);
    app.emit('active');
    jest.advanceTimersByTime(60_000);
    expect(socket.calls).toEqual([]);
  });

  it('starts the countdown when attached while already in the background', () => {
    const app = lifecycle('background');
    const socket = connection();
    attachAppStatePolicy(socket, app);
    jest.advanceTimersByTime(BACKGROUND_DISCONNECT_MS);
    expect(socket.calls).toEqual(['disconnect']);
  });

  it('stops acting once detached', () => {
    const app = lifecycle();
    const socket = connection();
    const detach = attachAppStatePolicy(socket, app);
    app.emit('background');
    detach();
    jest.advanceTimersByTime(BACKGROUND_DISCONNECT_MS);
    app.emit('active');
    expect(socket.calls).toEqual([]);
  });
});
