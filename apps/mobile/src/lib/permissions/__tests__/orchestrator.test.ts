import { describe, expect, it } from '@jest/globals';
import type { PermissionKind } from '@cp/domain';

import {
  createOrchestrator,
  type PermissionAnalyticsEvent,
  type PermissionsPort,
  type PrimerAnswer,
  type PrimerRequest,
  type RequestLevel,
} from '../orchestrator';
import { createPermissionStore, type KeyValueStorage, type PermissionReport } from '../store';

function memoryStorage(): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => data.delete(key),
  };
}

const report = (kind: PermissionKind, over: Partial<PermissionReport> = {}): PermissionReport => ({
  kind,
  status: 'not_determined',
  canAskAgain: true,
  available: true,
  ...over,
});

/** The OS: current answers per kind, and what each prompt turns them into. */
function fakeOs(
  current: Partial<Record<PermissionKind, PermissionReport>>,
  afterPrompt: Partial<Record<PermissionKind, PermissionReport>>,
) {
  const prompts: [PermissionKind, RequestLevel | undefined][] = [];
  const settings: string[] = [];
  const port: PermissionsPort = {
    getStatus: (kind) => Promise.resolve(current[kind] ?? report(kind)),
    request(kind, level) {
      prompts.push([kind, level]);
      const next = afterPrompt[kind] ?? current[kind] ?? report(kind);
      current[kind] = next;
      return Promise.resolve(next);
    },
    openSettings(target) {
      settings.push(target);
      return Promise.resolve(true);
    },
    settingsTargetFor: (kind) => (kind === 'notifications' ? 'notifications' : 'app'),
  };
  return { port, prompts, settings };
}

function setup(
  os: ReturnType<typeof fakeOs>,
  answer: PrimerAnswer | null,
  opts: { now?: number; windowMs?: number } = {},
) {
  const storage = memoryStorage();
  const store = createPermissionStore(storage);
  const shown: PrimerRequest[] = [];
  const events: PermissionAnalyticsEvent[] = [];
  let clock = opts.now ?? 1_000_000;
  const orchestrator = createOrchestrator({
    port: os.port,
    store,
    presenter: () =>
      answer === null
        ? null
        : (request) => {
            shown.push(request);
            return Promise.resolve(answer);
          },
    now: () => clock,
    reaskWindowMs: () => opts.windowMs,
    track: (event) => events.push(event),
  });
  return {
    orchestrator,
    store,
    storage,
    shown,
    events,
    advance: (ms: number) => (clock += ms),
  };
}

describe('requestWithPrimer', () => {
  it('shows the primer, then the OS prompt, and reports granted', async () => {
    const os = fakeOs({}, { camera: report('camera', { status: 'granted', canAskAgain: false }) });
    const ctx = setup(os, 'accept');
    const outcome = await ctx.orchestrator.requestWithPrimer('camera', 'real_photo');
    expect(outcome.result).toBe('granted');
    expect(ctx.shown).toEqual([{ kind: 'camera', trigger: 'real_photo', mode: 'primer' }]);
    expect(os.prompts).toEqual([['camera', undefined]]);
    expect(ctx.store.getState().reports.camera?.status).toBe('granted');
    expect(ctx.events).toEqual([
      {
        name: 'permission_primer_shown',
        kind: 'camera',
        trigger: 'real_photo',
        settingsOnly: false,
      },
      { name: 'permission_result', perm: 'camera', context: 'real_photo', result: 'granted' },
    ]);
  });

  it('never prompts the OS when the primer is declined, and stays quiet for the window', async () => {
    const os = fakeOs({}, {});
    const ctx = setup(os, 'decline');
    expect((await ctx.orchestrator.requestWithPrimer('notifications', 'first_vote')).result).toBe(
      'declined',
    );
    expect(os.prompts).toEqual([]);
    ctx.advance(60_000);
    expect((await ctx.orchestrator.requestWithPrimer('notifications', 'first_vote')).result).toBe(
      'suppressed',
    );
    expect(ctx.shown).toHaveLength(1);
    ctx.advance(7 * 24 * 60 * 60_000);
    expect((await ctx.orchestrator.requestWithPrimer('notifications', 'first_vote')).result).toBe(
      'declined',
    );
    expect(ctx.shown).toHaveLength(2);
  });

  it('honours a server-configured re-ask window', async () => {
    const ctx = setup(fakeOs({}, {}), 'decline', { windowMs: 1000 });
    await ctx.orchestrator.requestWithPrimer('calendar', 'date_finding');
    ctx.advance(1000);
    await ctx.orchestrator.requestWithPrimer('calendar', 'date_finding');
    expect(ctx.shown).toHaveLength(2);
  });

  it('reports denied when the OS says no, blocked once it will not ask again', async () => {
    const os = fakeOs(
      {},
      { location: report('location', { status: 'denied', canAskAgain: false, level: 'none' }) },
    );
    const ctx = setup(os, 'accept');
    const outcome = await ctx.orchestrator.requestWithPrimer('location', 'trip_start');
    expect(outcome).toMatchObject({ result: 'denied', report: { canAskAgain: false } });
    expect(ctx.events.at(-1)).toMatchObject({ name: 'permission_result', result: 'blocked' });
  });

  it('offers only Settings after an OS denial', async () => {
    const os = fakeOs({ camera: report('camera', { status: 'denied', canAskAgain: false }) }, {});
    const ctx = setup(os, 'accept');
    const outcome = await ctx.orchestrator.requestWithPrimer('camera', 'real_photo');
    expect(outcome).toEqual({ result: 'settings', opened: true });
    expect(ctx.shown[0]?.mode).toBe('settings');
    expect(os.prompts).toEqual([]);
    expect(os.settings).toEqual(['app']);
  });

  it('treats provisional notifications as usable, and quiet if that was the ask', async () => {
    const provisional = report('notifications', { status: 'provisional' });
    const ctx = setup(fakeOs({}, { notifications: provisional }), 'accept');
    expect((await ctx.orchestrator.requestWithPrimer('notifications', 'first_vote')).result).toBe(
      'partial',
    );
    const quiet = setup(fakeOs({}, { notifications: provisional }), 'accept');
    expect(
      (
        await quiet.orchestrator.requestWithPrimer('notifications', 'first_vote', {
          level: 'provisional',
        })
      ).result,
    ).toBe('granted');
  });

  it('reports limited photos and approximate location as partial', async () => {
    const photos = setup(
      fakeOs({}, { photos_read: report('photos_read', { status: 'limited' }) }),
      'accept',
    );
    expect(
      (await photos.orchestrator.requestWithPrimer('photos_read', 'album_ingest')).result,
    ).toBe('partial');
    const approx = report('location', { status: 'granted', level: 'wiu', precise: false });
    const location = setup(fakeOs({}, { location: approx }), 'accept');
    const outcome = await location.orchestrator.requestWithPrimer('location', 'trip_start');
    expect(outcome.result).toBe('partial');
    expect(location.events.at(-1)).toMatchObject({ result: 'limited' });
  });

  it('asks Always as its own step and counts WIU as partial for it', async () => {
    const wiu = report('location', { status: 'granted', level: 'wiu', precise: true });
    const os = fakeOs({ location: wiu }, { location: wiu });
    const ctx = setup(os, 'accept');
    const outcome = await ctx.orchestrator.requestWithPrimer('location', 'always_upgrade', {
      level: 'always',
    });
    expect(outcome.result).toBe('partial');
    expect(os.prompts).toEqual([['location', 'always']]);
    expect(ctx.shown[0]).toMatchObject({ level: 'always' });
    expect(ctx.events.at(-1)).toMatchObject({ perm: 'location_always' });
  });

  it('skips the primer when the need is already met or the kind is unavailable', async () => {
    const os = fakeOs(
      {
        camera: report('camera', { status: 'granted' }),
        live_activities: report('live_activities', { available: false }),
      },
      {},
    );
    const ctx = setup(os, 'accept');
    expect((await ctx.orchestrator.requestWithPrimer('camera', 'real_photo')).result).toBe(
      'granted',
    );
    expect((await ctx.orchestrator.requestWithPrimer('live_activities', 'settings')).result).toBe(
      'unavailable',
    );
    expect(ctx.shown).toEqual([]);
  });

  it('prompts straight away from a card the user toggled on, and asks speech with the mic', async () => {
    const os = fakeOs(
      {},
      {
        microphone: report('microphone', { status: 'granted' }),
        speech: report('speech', { status: 'granted' }),
      },
    );
    const ctx = setup(os, 'decline');
    const outcome = await ctx.orchestrator.requestWithPrimer('microphone', 'voice', {
      primed: true,
    });
    expect(outcome.result).toBe('granted');
    expect(ctx.shown).toEqual([]);
    expect(os.prompts).toEqual([
      ['microphone', undefined],
      ['speech', undefined],
    ]);
    expect(ctx.store.getState().reports.speech?.status).toBe('granted');
  });

  it('answers settings without opening them for a primed card the OS already refused', async () => {
    const os = fakeOs(
      { calendar: report('calendar', { status: 'denied', canAskAgain: false }) },
      {},
    );
    const ctx = setup(os, 'accept');
    expect(
      await ctx.orchestrator.requestWithPrimer('calendar', 'onboarding', { primed: true }),
    ).toEqual({
      result: 'settings',
      opened: false,
    });
    expect(os.settings).toEqual([]);
  });

  it('stays quiet when no primer host is mounted', async () => {
    const ctx = setup(fakeOs({}, {}), null);
    expect((await ctx.orchestrator.requestWithPrimer('camera', 'real_photo')).result).toBe(
      'suppressed',
    );
  });
});
