/**
 * The Help hub against a migrated Postgres through the real doors: the context (curated numbers,
 * facilities by drive time, phrases; limited coverage without a curated country), the one-hour
 * Help share (start, replay, pause override, extend with its cap, stop, and the window closing by
 * itself once its hour has passed), the human clinic hand-off with consent, and the checklist in
 * the app's own wording when the model is missing or never answers.
 */
import { createGateway } from '@cp/ai';
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCommand } from '../location/location-fixture';
import type { SignedIn } from '../routes/command-doors-harness';
import {
  buildSafetyTrip,
  startSafetyHarness,
  UBUD,
  type SafetyHarness,
  type SafetyTrip,
} from './safety-fixture';

let harness: SafetyHarness;
let fx: SafetyTrip;
const MINUTE = 60_000;

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.doors.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function get(who: SignedIn, path: string) {
  const response = await harness.doors.request(path, { headers: { cookie: who.cookie } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** What `who` may do with a share: see its fixes, and (as its owner) still write them. */
async function sees(who: SignedIn, shareId: string) {
  return withUser(harness.doors.pool, who.uid, '', async (tx) => {
    const { rows } = await tx.query<{ visible: boolean; own: boolean }>(
      'SELECT app.can_see_location($1) AS visible, app.is_own_active_share($1) AS own',
      [shareId],
    );
    return rows[0];
  });
}

const contextPath = (tripId: string, at: { lat: number; lng: number } | null = UBUD) =>
  `/v1/help/context?trip_id=${tripId}${at === null ? '' : `&lat=${at.lat}&lng=${at.lng}`}`;

beforeAll(async () => {
  harness = await startSafetyHarness();
  fx = await buildSafetyTrip(harness);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('GET /v1/help/context', () => {
  it("answers the country's curated numbers, facilities by drive time and the local phrases", async () => {
    const { status, body } = await get(fx.rin, contextPath(fx.tripId));
    expect(status).toBe(200);
    expect(body).toMatchObject({ coverage: 'full', country: 'ID', active_share: null });
    const numbers = body['numbers'] as {
      general: string;
      lines: { service: string; number: string }[];
    };
    expect(numbers.general).toBe('112');
    expect(numbers.lines.map((line) => line.number).sort()).toEqual(['110', '112', '118']);
    const facilities = body['facilities'] as {
      id: string;
      minutes: number | null;
      estimate: boolean;
      open_now: boolean | null;
      insurance_match: boolean;
    }[];
    expect(facilities[0]).toMatchObject({ id: fx.clinicId, estimate: true, open_now: true });
    expect(facilities[0]!.minutes).toBeGreaterThan(0);
    expect(facilities[1]!.minutes).toBeGreaterThan(facilities[0]!.minutes!);
    expect(facilities.every((f) => !f.insurance_match)).toBe(true);
    const phrases = body['phrases'] as { key: string; text: string }[];
    expect(phrases.map((p) => p.key)).toEqual(['id:emergency:need-doctor', 'id:emergency:help']);
  });

  it('never states a number the catalogue does not hold', async () => {
    const { body } = await get(fx.maya, contextPath(fx.tripId));
    const numbers = body['numbers'] as { general: string; lines: { number: string }[] };
    const said = [numbers.general, ...numbers.lines.map((line) => line.number)];
    for (const number of said) expect(['112', '110', '118']).toContain(number);
    const phones = (body['facilities'] as { phone: string | null }[]).map((f) => f.phone);
    expect(phones.sort()).toEqual(['+62-361-2014-505', '+62-361-227-911']);
  });

  it('names the place in letters the traveller can read when the landmark has several names', async () => {
    const bridge = { lat: 16.0611, lng: 108.2272 };
    await query(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       SELECT destination_id, v.name, 'other', v.lat, v.lng FROM trips,
         (VALUES ('ドラゴンブリッジ', 16.0611, 108.2272), ('Cầu Rồng', 16.0612, 108.2273),
                 ('Dragon Bridge', 16.0613, 108.2274)) AS v(name, lat, lng)
        WHERE trips.id = $1`,
      [fx.tripId],
    );
    const { body } = await get(fx.rin, contextPath(fx.tripId, bridge));
    expect(body['place_label']).toMatch(/^Cầu Rồng/u);
  });

  it('leaves drive times out without a position', async () => {
    const { body } = await get(fx.maya, contextPath(fx.tripId, null));
    const facilities = body['facilities'] as { minutes: number | null }[];
    expect(facilities.every((f) => f.minutes === null)).toBe(true);
  });

  it('answers limited coverage with the GSM number where no country is curated', async () => {
    const limited = await buildSafetyTrip(harness, { country: null });
    const { body } = await get(limited.maya, contextPath(limited.tripId));
    expect(body).toMatchObject({ coverage: 'limited', numbers: { general: '112' }, phrases: [] });
  });

  it('answers NOT_ELIGIBLE to a crewmate off the trip and to an outsider', async () => {
    for (const who of [fx.sam, fx.olly]) {
      const { status, body } = await get(who, contextPath(fx.tripId));
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } });
    }
  });
});

describe('the Help share', () => {
  let shareId: string;
  let sessionId: string;

  it('shares for one hour, opens a Help session and arms its expiry', async () => {
    const opId = generateUuidV7();
    const before = Date.now();
    const res = await runCommand(
      harness.doors,
      fx.jordan,
      'start_help_share',
      { trip_id: fx.tripId, reason: 'help' },
      { opId },
    );
    expect(res.status).toBe(200);
    const result = res.body['result'] as {
      share_id: string;
      session_id: string;
      ends_at: string;
      overrode_pause: boolean;
    };
    ({ share_id: shareId, session_id: sessionId } = result);
    expect(result.overrode_pause).toBe(false);
    const ends = Date.parse(result.ends_at);
    expect(ends - before).toBeGreaterThanOrEqual(60 * MINUTE - 5000);
    expect(ends - before).toBeLessThanOrEqual(60 * MINUTE + 5000);
    const [session] = await query<{ kind: string; status: string; share_id: string }>(
      'SELECT kind, status, share_id FROM help_sessions WHERE id = $1',
      [sessionId],
    );
    expect(session).toEqual({ kind: 'help', status: 'open', share_id: shareId });
    const jobs = await query<{ start_after: Date }>(
      "SELECT start_after FROM pgboss.job WHERE name = 'help.share_expire' AND data->>'share_id' = $1",
      [shareId],
    );
    expect(jobs.map((job) => job.start_after.getTime())).toEqual([ends]);
    const events = await harness.doors.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'help_share.started' AND aggregate_id = $1",
      [sessionId],
    );
    expect(events.rowCount).toBe(1);

    const replay = await runCommand(
      harness.doors,
      fx.jordan,
      'start_help_share',
      { trip_id: fx.tripId, reason: 'help' },
      { opId },
    );
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const again = await runCommand(harness.doors, fx.jordan, 'start_help_share', {
      trip_id: fx.tripId,
      reason: 'help',
    });
    expect(again.body['result']).toMatchObject({ share_id: shareId, session_id: sessionId });
  });

  it('lets the crew see the share on an unboosted trip', async () => {
    expect(await sees(fx.rin, shareId)).toEqual({ visible: true, own: false });
  });

  it('extends by an hour at a time, never more than three hours ahead', async () => {
    let last = 0;
    for (let i = 0; i < 4; i += 1) {
      const res = await runCommand(harness.doors, fx.jordan, 'extend_help_share', {
        share_id: shareId,
      });
      expect(res.status).toBe(200);
      last = Date.parse((res.body['result'] as { ends_at: string }).ends_at);
    }
    expect(last - Date.now()).toBeLessThanOrEqual(180 * MINUTE + 1000);
    expect(last - Date.now()).toBeGreaterThan(179 * MINUTE);
    const other = await runCommand(harness.doors, fx.rin, 'extend_help_share', {
      share_id: shareId,
    });
    expect(other.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('ends by itself once its hour has passed on the clock', async () => {
    await query(
      `UPDATE location_shares SET starts_at = now() - interval '61 minutes',
              ends_at = now() - interval '1 minute' WHERE id = $1`,
      [shareId],
    );
    expect(await sees(fx.jordan, shareId)).toEqual({ visible: false, own: false });
    const { body } = await get(fx.jordan, contextPath(fx.tripId));
    expect(body['active_share']).toBeNull();
    const late = await runCommand(harness.doors, fx.jordan, 'extend_help_share', {
      share_id: shareId,
    });
    expect(late.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
  });

  it('overrides a paused crew-map share and stops on request', async () => {
    await query(
      `INSERT INTO location_shares (trip_id, user_id, reason, paused, ends_at)
       VALUES ($1, $2, 'crew_map', true, now() + interval '1 day')`,
      [fx.tripId, fx.rin.uid],
    );
    const res = await runCommand(harness.doors, fx.rin, 'start_help_share', {
      trip_id: fx.tripId,
      reason: 'help',
    });
    const started = res.body['result'] as {
      share_id: string;
      session_id: string;
      overrode_pause: boolean;
    };
    expect(started.overrode_pause).toBe(true);
    const stop = await runCommand(harness.doors, fx.rin, 'stop_help_share', {
      share_id: started.share_id,
    });
    expect(stop.status).toBe(200);
    const [session] = await query<{ status: string }>(
      'SELECT status FROM help_sessions WHERE id = $1',
      [started.session_id],
    );
    expect(session?.status).toBe('resolved');
    const [share] = await query<{ open: boolean }>(
      'SELECT ends_at > now() AS open FROM location_shares WHERE id = $1',
      [started.share_id],
    );
    expect(share?.open).toBe(false);
  });
});

describe('request_ops_clinic_call', () => {
  it('opens one clinic desk task with the approved text and a pending step', async () => {
    const res = await runCommand(harness.doors, fx.maya, 'request_ops_clinic_call', {
      trip_id: fx.tripId,
      facility_id: fx.clinicId,
      share_insurance: true,
      text_shown: 'The ops desk will call International SOS Bali Clinic with you.',
    });
    expect(res.status).toBe(200);
    const result = res.body['result'] as {
      session_id: string;
      task_id: string;
      insurance_shared: boolean;
    };
    expect(result.insurance_shared).toBe(false);
    const [task] = await query<{ kind: string; requested_by: string; approved: string }>(
      `SELECT t.kind, t.requested_by, a.text_shown AS approved
         FROM ops.concierge_tasks t JOIN ops.approvals a ON a.id = t.approval_id WHERE t.id = $1`,
      [result.task_id],
    );
    expect(task).toEqual({
      kind: 'clinic_handoff',
      requested_by: fx.maya.uid,
      approved: 'The ops desk will call International SOS Bali Clinic with you.',
    });
    const [session] = await query<{ steps: Record<string, { state: string }>; clinic: boolean }>(
      'SELECT steps, clinic_requested_at IS NOT NULL AS clinic FROM help_sessions WHERE id = $1',
      [result.session_id],
    );
    expect(session?.clinic).toBe(true);
    expect(session?.steps['ops_clinic']?.state).toBe('pending');
  });

  it('refuses a session that is not the caller’s own', async () => {
    const [other] = await query<{ id: string }>(
      "INSERT INTO help_sessions (trip_id, user_id, kind) VALUES ($1, $2, 'help') RETURNING id",
      [fx.tripId, fx.rin.uid],
    );
    const res = await runCommand(harness.doors, fx.maya, 'request_ops_clinic_call', {
      trip_id: fx.tripId,
      session_id: other!.id,
      share_insurance: false,
      text_shown: 'Call the clinic with me.',
    });
    expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('GET /v1/help/checklist', () => {
  const path = () =>
    `/v1/help/checklist?trip_id=${fx.tripId}&problem=hurt&lat=${UBUD.lat}&lng=${UBUD.lng}`;

  it("answers the curated steps in the app's own wording without a model", async () => {
    harness.gateway = undefined;
    const { status, body } = await get(fx.rin, path());
    expect(status).toBe(200);
    const steps = body['steps'] as {
      id: string;
      facts: Record<string, unknown>;
      text: string | null;
    }[];
    expect(body['worded']).toBe(false);
    expect(steps.map((s) => s.id)).toEqual([
      'hurt.nearest_facility',
      'hurt.phrase',
      'hurt.call_number',
      'hurt.insurance_line',
      'hurt.ops_clinic',
    ]);
    expect(steps[0]!.facts['name']).toBe('International SOS Bali Clinic');
    expect(steps[1]!.facts['phrase']).toBe('Saya butuh dokter.');
    expect(steps[2]!.facts['number']).toBe('112');
    expect(steps.every((s) => s.text === null)).toBe(true);
  });

  it('falls back within its time budget when the model never answers', async () => {
    harness.gateway = createGateway({
      apiKey: 'unanswered',
      maxAttempts: 1,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const started = Date.now();
    const { status, body } = await get(fx.rin, path());
    expect(status).toBe(200);
    expect(body['worded']).toBe(false);
    expect(Date.now() - started).toBeLessThan(6000);
    harness.gateway = undefined;
  }, 20_000);
});
