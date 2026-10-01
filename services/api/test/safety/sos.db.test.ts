/**
 * Crew SOS commands against a migrated Postgres through the real doors: a trigger records the
 * incident, its own location share, the first fix and the sealed notes, and queues the orchestrator
 * in the same transaction; a replay (same op or same client id) keeps one incident; a queued
 * trigger that reached the server more than ten minutes late alerts nobody and says `stale`
 * (unless the device clock was behind, or the sender confirmed it); responders, the thread, the
 * private notes and resolving (with every SOS share ending).
 */
import { randomUUID } from 'node:crypto';

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

/** A UUIDv7 minted `ms` in the past, as an op queued on a phone that long ago would carry. */
function uuidV7At(ms: number): string {
  const fresh = generateUuidV7().replaceAll('-', '');
  const hex = Math.floor(ms).toString(16).padStart(12, '0') + fresh.slice(12);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Uploads one queued op the way the offline queue does, returning its stored outcome. */
async function upload(who: SignedIn, cmd: string, payload: unknown, queuedAt: number) {
  const op = {
    op_id: uuidV7At(queuedAt),
    cmd,
    v: 1,
    actor: { uid: who.uid, via: 'offline' },
    device: { id: randomUUID(), platform: 'ios', app_version: '1.0.0', tz: 'Asia/Makassar' },
    client_ts: new Date(queuedAt).toISOString(),
    payload,
  };
  const response = await harness.doors.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({ ops: [op] }),
  });
  expect(response.status).toBe(200);
  // `cmd_results` is closed to the app roles; the suite reads it as the owner.
  const { rows } = await harness.doors.pool.query<{
    status: string;
    result_ref: Record<string, unknown> | null;
  }>('SELECT status, result_ref FROM cmd_results WHERE op_id = $1', [op.op_id]);
  const row = rows[0];
  return row;
}

const trigger = (who: SignedIn, extra: Record<string, unknown> = {}, opId?: string) =>
  runCommand(
    harness.doors,
    who,
    'trigger_sos',
    { trip_id: fx.tripId, ...extra },
    opId === undefined ? {} : { opId },
  );

beforeAll(async () => {
  harness = await startSafetyHarness();
  fx = await buildSafetyTrip(harness);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trigger_sos', () => {
  let sosId: string;

  it('records the incident, its share, the first fix and the notes, and queues the fan-out', async () => {
    const opId = generateUuidV7();
    const first = {
      preset: 'fell',
      text: 'came off the scooter',
      place_label: 'Jalan Raya Campuhan, Ubud',
      fix: { ...UBUD, acc: 12, at: new Date().toISOString() },
      health_notes: 'Allergic to penicillin',
    };
    const res = await trigger(fx.jordan, first, opId);
    expect(res.status).toBe(200);
    const result = res.body['result'] as { sos_id: string; status: string; notes_saved: boolean };
    expect(result).toMatchObject({ status: 'alerting', notes_saved: true });
    sosId = result.sos_id;
    const [session] = await query<{
      status: string;
      share_id: string;
      steps: Record<string, { state: string }>;
    }>('SELECT status, share_id, steps FROM help_sessions WHERE id = $1', [sosId]);
    expect(session?.status).toBe('open');
    expect(session?.share_id).toBe(sosId);
    expect(session?.steps['location_live']?.state).toBe('done');
    expect(session?.steps['sent']?.state).toBe('pending');
    const [share] = await query<{ reason: string; ends_at: Date | null }>(
      'SELECT reason, ends_at FROM location_shares WHERE id = $1',
      [sosId],
    );
    expect(share).toEqual({ reason: 'sos', ends_at: null });
    const fixes = await query('SELECT 1 FROM location_fixes WHERE share_id = $1', [sosId]);
    expect(fixes).toHaveLength(1);
    const [sealed] = await query<{ health_notes_enc: string }>(
      'SELECT health_notes_enc FROM help_session_private WHERE help_session_id = $1',
      [sosId],
    );
    expect(sealed?.health_notes_enc).not.toContain('penicillin');
    const jobs = await query<{ data: { sos_id: string; event_id: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'sos.orchestrate' AND data->>'sos_id' = $1",
      [sosId],
    );
    expect(jobs).toHaveLength(1);
    const events = await harness.doors.pool.query<{ id: string }>(
      "SELECT id FROM domain_events WHERE type = 'sos.triggered' AND aggregate_id = $1",
      [sosId],
    );
    expect(events.rows.map((row) => row.id)).toEqual([jobs[0]!.data.event_id]);

    const replay = await trigger(fx.jordan, first, opId);
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const again = await trigger(fx.jordan, { sos_id: sosId, preset: 'fell' });
    expect(again.body['result']).toMatchObject({ sos_id: sosId, status: 'alerting' });
    const incidents = await query("SELECT 1 FROM help_sessions WHERE kind = 'sos' AND id = $1", [
      sosId,
    ]);
    expect(incidents).toHaveLength(1);
    const queued = await query(
      "SELECT 1 FROM pgboss.job WHERE name = 'sos.orchestrate' AND data->>'sos_id' = $1",
      [sosId],
    );
    expect(queued).toHaveLength(1);
  });

  it('lets only the sender and a responder read the notes', async () => {
    const read = async (who: SignedIn) => {
      const response = await harness.doors.request(`/v1/sos/${sosId}/private`, {
        headers: { cookie: who.cookie },
      });
      return ((await response.json()) as { health_notes: string | null }).health_notes;
    };
    expect(await read(fx.jordan)).toBe('Allergic to penicillin');
    expect(await read(fx.rin)).toBeNull();
    const coming = await runCommand(harness.doors, fx.rin, 'respond_sos', {
      sos_id: sosId,
      state: 'coming',
    });
    expect(coming.status).toBe(200);
    expect(await read(fx.rin)).toBe('Allergic to penicillin');
    for (const who of [fx.maya, fx.sam, fx.olly]) expect(await read(who)).toBeNull();
  });

  it('makes a responder of whoever is coming, and never downgrades them', async () => {
    const seen = await runCommand(harness.doors, fx.maya, 'respond_sos', {
      sos_id: sosId,
      state: 'seen',
    });
    expect(seen.body['result']).toMatchObject({ state: 'seen', share_id: null });
    const [row] = await query<{
      status: string;
      responder_ids: string[];
      responses: Record<string, { state: string; share_id?: string }>;
    }>('SELECT status, responder_ids, responses FROM help_sessions WHERE id = $1', [sosId]);
    expect(row?.status).toBe('responding');
    expect(row?.responder_ids).toEqual([fx.rin.uid]);
    expect(row?.responses[fx.maya.uid]?.state).toBe('seen');
    expect(row?.responses[fx.rin.uid]?.state).toBe('coming');
    const rinShare = row?.responses[fx.rin.uid]?.share_id;
    const [share] = await query<{ reason: string; user_id: string }>(
      'SELECT reason, user_id FROM location_shares WHERE id = $1',
      [rinShare],
    );
    expect(share).toEqual({ reason: 'sos', user_id: fx.rin.uid });
    const back = await runCommand(harness.doors, fx.rin, 'respond_sos', {
      sos_id: sosId,
      state: 'seen',
    });
    expect(back.body['result']).toMatchObject({ state: 'coming', share_id: rinShare });
    const eta = await query(
      "SELECT 1 FROM pgboss.job WHERE name = 'sos.responder_eta' AND data->>'sos_id' = $1",
      [sosId],
    );
    expect(eta.length).toBeGreaterThan(0);
  });

  it('refuses the sender, a crewmate off the trip and an outsider', async () => {
    const own = await runCommand(harness.doors, fx.jordan, 'respond_sos', {
      sos_id: sosId,
      state: 'coming',
    });
    expect(own.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
    const off = await runCommand(harness.doors, fx.sam, 'respond_sos', {
      sos_id: sosId,
      state: 'seen',
    });
    expect(off.body).toMatchObject({ error: { code: 'NOT_ELIGIBLE' } });
    const outsider = await runCommand(harness.doors, fx.olly, 'respond_sos', {
      sos_id: sosId,
      state: 'seen',
    });
    expect(outsider.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('keeps one thread message per id', async () => {
    const messageId = generateUuidV7();
    for (let i = 0; i < 2; i += 1) {
      const sent = await runCommand(harness.doors, fx.jordan, 'send_sos_message', {
        sos_id: sosId,
        message_id: messageId,
        body: "knee's scraped up, bike's fine",
      });
      expect(sent.status).toBe(200);
    }
    const rows = await query('SELECT 1 FROM help_session_messages WHERE id = $1', [messageId]);
    expect(rows).toHaveLength(1);
    const hints = await query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'message'",
      [`sos:${sosId}`],
    );
    expect(hints).toHaveLength(1);
  });

  it('lets a responder resolve it; every SOS share ends and the crew hears it', async () => {
    const bystander = await runCommand(harness.doors, fx.maya, 'resolve_sos', { sos_id: sosId });
    expect(bystander.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const res = await runCommand(harness.doors, fx.rin, 'resolve_sos', { sos_id: sosId });
    expect(res.body['result']).toEqual({ sos_id: sosId, status: 'resolved', alerted: true });
    const open = await query(
      "SELECT 1 FROM location_shares WHERE trip_id = $1 AND reason = 'sos' AND (ends_at IS NULL OR ends_at > now())",
      [fx.tripId],
    );
    expect(open).toEqual([]);
    const hints = await query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'resolved'",
      [`sos:${sosId}`],
    );
    expect(hints).toHaveLength(1);
    const later = await runCommand(harness.doors, fx.jordan, 'send_sos_message', {
      sos_id: sosId,
      body: 'ok',
    });
    expect(later.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
  });
});

describe('a queued trigger_sos that reaches the server late', () => {
  let staleId: string;

  it('alerts nobody when it is older than ten minutes, and records a stale outcome', async () => {
    const outcome = await upload(
      fx.maya,
      'trigger_sos',
      { trip_id: fx.tripId, preset: 'lost' },
      Date.now() - 14 * MINUTE,
    );
    expect(outcome?.status).toBe('applied');
    expect(outcome?.result_ref).toMatchObject({ status: 'stale' });
    staleId = String(outcome?.result_ref?.['sos_id']);
    const [session] = await query<{ status: string; share_id: string | null }>(
      'SELECT status, share_id FROM help_sessions WHERE id = $1',
      [staleId],
    );
    expect(session).toEqual({ status: 'stale', share_id: null });
    expect(
      await query(
        "SELECT 1 FROM pgboss.job WHERE name = 'sos.orchestrate' AND data->>'sos_id' = $1",
        [staleId],
      ),
    ).toEqual([]);
    expect(await query('SELECT 1 FROM location_shares WHERE id = $1', [staleId])).toEqual([]);
    expect(await query('SELECT 1 FROM rt_outbox WHERE channel = $1', [`sos:${staleId}`])).toEqual(
      [],
    );
    const types = await harness.doors.pool.query<{ type: string }>(
      'SELECT type FROM domain_events WHERE aggregate_id = $1',
      [staleId],
    );
    expect(types.rows.map((row) => row.type)).toEqual(['sos.stale']);
    const others = await withUser(harness.doors.pool, fx.rin.uid, '', (tx) =>
      tx.query('SELECT 1 FROM help_sessions WHERE id = $1', [staleId]),
    );
    expect(others.rowCount).toBe(0);
  });

  it('still alerts when the late look came from a device clock running behind', async () => {
    const outcome = await upload(
      fx.rin,
      'trigger_sos',
      { trip_id: fx.tripId, preset: 'need_ride', clock_offset_ms: 15 * MINUTE },
      Date.now() - 15 * MINUTE,
    );
    expect(outcome?.result_ref).toMatchObject({ status: 'alerting' });
  });

  it('SEND NOW alerts with a fresh trigger and closes the stale one', async () => {
    const res = await trigger(fx.maya, { preset: 'lost', confirm_of: staleId });
    expect(res.body['result']).toMatchObject({ status: 'alerting' });
    const [old] = await query<{ status: string; false_alarm: boolean }>(
      'SELECT status, false_alarm FROM help_sessions WHERE id = $1',
      [staleId],
    );
    expect(old).toEqual({ status: 'resolved', false_alarm: false });
  });

  it("I'M OK resolves a stale SOS as a quiet false alarm", async () => {
    const outcome = await upload(
      fx.jordan,
      'trigger_sos',
      { trip_id: fx.tripId },
      Date.now() - 30 * MINUTE,
    );
    const id = String(outcome?.result_ref?.['sos_id']);
    const res = await runCommand(harness.doors, fx.jordan, 'resolve_sos', { sos_id: id });
    expect(res.body['result']).toEqual({ sos_id: id, status: 'resolved', alerted: false });
    const [row] = await query<{ false_alarm: boolean }>(
      'SELECT false_alarm FROM help_sessions WHERE id = $1',
      [id],
    );
    expect(row?.false_alarm).toBe(true);
    expect(await query('SELECT 1 FROM rt_outbox WHERE channel = $1', [`sos:${id}`])).toEqual([]);
  });
});
