/**
 * The external purge, store by store: each step erases what the account left there with the calls
 * that store expects, a second run finds nothing left, one store refusing never stops the
 * others, and the failed step succeeds on the retry.
 */
import { userPid } from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { externalPurgeSteps, runExternalPurge } from '../../src/jobs/account/purge-external';
import { PID_SALT, PURGE_UID, vendorDouble, type VendorDouble } from './purge-vendors';

const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
const UPLOADS = `u/${PURGE_UID}`;

let vendors: VendorDouble;
beforeEach(() => {
  vendors = vendorDouble();
  vi.stubGlobal('fetch', vendors.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** With nothing said about quarantine or the tracker, the first is held and the second skipped. */
const LEFT = { quarantined_uploads: 'held', feedback_tracker: 'not_configured' } as const;

const callsTo = (host: string) => vendors.calls.filter((call) => call.includes(` ${host}/`));

describe('external purge', () => {
  it('erases the account from every store with one delete per object, person and trace batch', async () => {
    const report = await runExternalPurge(vendors.steps(), PURGE_UID, silent);
    expect(report).toEqual({
      media: 'erased',
      analytics: 'erased',
      ai_traces: 'erased',
      ...LEFT,
    });

    expect(callsTo('r2.test').filter((call) => call.startsWith('DELETE'))).toEqual([
      `DELETE r2.test/media/${UPLOADS}/avatar/0199b7c1-3d52-7a41-8c0e-5f6a7b8c9d0e`,
      `DELETE r2.test/media/${UPLOADS}/feedback/0199b7c4-88aa-7c10-9d2b-0a1b2c3d4e5f`,
      `DELETE r2.test/media/exports/${PURGE_UID}/0199b7d0-1111-7222-8333-444455556666.zip`,
    ]);
    const pid = await userPid(PURGE_UID, PID_SALT);
    expect(callsTo('posthog.test')).toEqual([
      `GET posthog.test/api/projects/42/persons/?distinct_id=${pid}`,
      'DELETE posthog.test/api/projects/42/persons/0199b7e2-5a5a-7b6b-8c7c-9d8d0e9e1f0f/?delete_events=true',
    ]);
    expect(callsTo('langfuse.test')).toEqual([
      `GET langfuse.test/api/public/traces?userId=${PURGE_UID}&limit=100&page=1`,
      'DELETE langfuse.test/api/public/traces',
    ]);
  });

  it('finds nothing left on a second run and deletes nothing again', async () => {
    await runExternalPurge(vendors.steps(), PURGE_UID, silent);
    vendors.calls.length = 0;

    const again = await runExternalPurge(vendors.steps(), PURGE_UID, silent);
    expect(again).toEqual({
      media: 'nothing_left',
      analytics: 'nothing_left',
      ai_traces: 'nothing_left',
      ...LEFT,
    });
    expect(vendors.calls.filter((call) => call.startsWith('DELETE'))).toEqual([]);
  });

  it.each(['r2.test', 'posthog.test', 'langfuse.test'])(
    'keeps going when %s refuses, and the retry finishes that store only',
    async (host) => {
      vendors.refusing.add(host);
      const first = await runExternalPurge(vendors.steps(), PURGE_UID, silent);
      const failed = Object.entries(first).filter(([, outcome]) => outcome === 'failed');
      expect(failed).toHaveLength(1);
      expect(Object.values(first).filter((outcome) => outcome === 'erased')).toHaveLength(2);

      vendors.refusing.delete(host);
      const retry = await runExternalPurge(vendors.steps(), PURGE_UID, silent);
      const [name] = failed[0] ?? [];
      expect(retry).toEqual({
        media: 'nothing_left',
        analytics: 'nothing_left',
        ai_traces: 'nothing_left',
        ...LEFT,
        [String(name)]: 'erased',
      });
    },
  );

  it('fails the analytics step when events are collected but nothing can delete them', async () => {
    const report = await runExternalPurge(
      vendors.steps({ analyticsAdmin: false }),
      PURGE_UID,
      silent,
    );
    expect(report).toEqual({
      media: 'erased',
      analytics: 'failed',
      ai_traces: 'erased',
      ...LEFT,
    });
    expect(callsTo('posthog.test')).toEqual([]);
  });

  it('reports a store this environment does not use, without calling anything', async () => {
    const steps = externalPurgeSteps({
      media: null,
      analytics: { collecting: false, admin: null, pidSalt: undefined },
      traces: null,
    });
    expect(await runExternalPurge(steps, PURGE_UID, silent)).toEqual({
      media: 'not_in_use',
      quarantined_uploads: 'not_in_use',
      analytics: 'not_in_use',
      ai_traces: 'not_in_use',
      feedback_tracker: 'not_configured',
    });
    expect(vendors.calls).toEqual([]);
  });

  it('holds quarantined uploads unless told to erase them, then erases only that account', async () => {
    const held = await runExternalPurge(vendors.steps(), PURGE_UID, silent);
    expect(held['quarantined_uploads']).toBe('held');
    expect(vendors.calls.join(' ')).not.toContain('quarantine');

    const steps = externalPurgeSteps({ ...vendors.stores(), eraseQuarantine: true });
    const erased = await runExternalPurge(steps, PURGE_UID, silent);
    expect(erased['quarantined_uploads']).toBe('erased');
    expect(
      callsTo('r2.test').filter((call) => call.startsWith('DELETE') && call.includes('quarantine')),
    ).toEqual([
      `DELETE r2.test/media/quarantine/${UPLOADS}/avatar/0199b7c9-2f10-7d3e-8a4b-6c5d4e3f2a1b`,
    ]);
    const again = await runExternalPurge(steps, PURGE_UID, silent);
    expect(again['quarantined_uploads']).toBe('nothing_left');
  });
});
