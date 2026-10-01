/**
 * Phase one of an orchestrator run, inside one transaction holding the object's frame row: read
 * the object, decide what every audience device should get (start, update, end, nothing), write
 * the rows those decisions need, and return the pushes to send. Rules:
 * - one live activity per (device, kind, object); a user's dismissal is final for that object;
 * - at most two per phone, by rank (SOS first); a lower newcomer falls back to notifications, as
 *   does a phone with Live Activities off or without a push-to-start token (counted, never sent),
 *   and an iPhone whose build does not draw the kind (baseline kinds only, unless it listed it);
 * - shared kinds update once on the broadcast channel; activities off it get per-token updates;
 * - priority 10 only when the loader says so (leave time, late, arrived, SOS) and the phone has
 *   frequent updates on; everything else is power-considerate;
 * - an unchanged frame sends nothing.
 */
import {
  admitActivity,
  LA_BASELINE_IOS_KINDS,
  LA_KIND_SPECS,
  type AppBundleId,
  type LaKind,
} from '@cp/domain';
import type pg from 'pg';

import type { LaSend } from './deliver';
import {
  audienceDevices,
  channelOf,
  endSends,
  liveRows,
  markEnded,
  slotsOn,
  type LaActivityRow,
  type LaDeviceRow,
} from './rows';
import { renderAlert, type LaRender, type LaSnapshot, type LaUrgency } from './snapshot';

export interface LaPlan {
  readonly sends: LaSend[];
  readonly seq: number;
  readonly fallbacks: number;
  readonly frame: Record<string, unknown>;
}

export interface PlanInput {
  readonly tx: pg.PoolClient;
  readonly kind: LaKind;
  readonly refId: string;
  readonly snapshot: LaSnapshot;
  readonly prev: Record<string, unknown> | null;
  readonly seq: number;
  readonly render: LaRender;
  readonly now: Date;
  readonly defaultBundleId: AppBundleId;
}

/** JSON with object keys sorted: a frame read back from jsonb has its keys reordered. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Same content apart from the version number. */
export function sameFrame(a: Record<string, unknown> | null, b: Record<string, unknown>): boolean {
  if (a === null) return false;
  const { seq: _a, ...restA } = a;
  const { seq: _b, ...restB } = b;
  return canonical(restA) === canonical(restB);
}

interface Frame {
  readonly frame: Record<string, unknown>;
  readonly staleAt: Date;
  readonly relevance: number;
}

async function updateSends(
  input: PlanInput,
  staying: readonly LaActivityRow[],
  devices: readonly LaDeviceRow[],
  urgency: LaUrgency,
  { frame, staleAt, relevance }: Frame,
): Promise<LaSend[]> {
  const spec = LA_KIND_SPECS[input.kind];
  const frequent = new Map(devices.map((d) => [d.device_id, d.la_frequent]));
  const alert =
    urgency.alert === undefined
      ? undefined
      : await renderAlert(input.render, devices[0]?.locale ?? 'en', urgency.alert);
  const common = {
    event: 'update' as const,
    contentState: frame,
    staleAt,
    relevance,
    ...(alert === undefined ? {} : { alert }),
  };
  const sends: LaSend[] = [];
  const channels = new Set<string>();
  for (const row of staying) {
    const channel = spec.broadcast ? channelOf(row) : null;
    if (row.platform === 'android') {
      if (row.fcm_token === null) continue;
      sends.push({
        ...common,
        priority: 5,
        via: 'fcm',
        rowId: row.id,
        token: row.fcm_token,
        kind: input.kind,
        refId: input.refId,
      });
    } else if (channel !== null) {
      if (channels.has(channel.channelId)) continue;
      channels.add(channel.channelId);
      sends.push({ ...common, priority: urgency.priority, via: 'broadcast', ...channel });
    } else if (
      row.activity_push_token !== null &&
      row.token_env !== null &&
      row.bundle_id !== null
    ) {
      sends.push({
        ...common,
        priority: frequent.get(row.device_id) === false ? 5 : urgency.priority,
        via: 'token',
        rowId: row.id,
        token: row.activity_push_token,
        env: row.token_env,
        bundleId: row.bundle_id,
      });
    }
  }
  return sends;
}

/** Ends the activities a newcomer displaces on one phone (that phone only, never the channel). */
async function evict(
  tx: pg.PoolClient,
  victims: readonly { id: string; kind: LaKind; refId: string }[],
  now: Date,
): Promise<LaSend[]> {
  const sends: LaSend[] = [];
  for (const victim of victims) {
    const own = (await liveRows(tx, victim.kind, victim.refId)).filter((r) => r.id === victim.id);
    const { rows } = await tx.query<{ last_state: Record<string, unknown> | null }>(
      'SELECT last_state FROM la_object_states WHERE kind = $1 AND ref_id = $2',
      [victim.kind, victim.refId],
    );
    const last = rows[0]?.last_state;
    if (last !== null && last !== undefined) {
      sends.push(
        ...endSends(
          own.map((row) => ({ ...row, apns_channel_id: null, channel_env: null })),
          last,
          now,
          0,
        ),
      );
    }
    await markEnded(tx, [victim.id], 'evicted', now);
  }
  return sends;
}

/** A start on one device, or null when it falls back to notifications. */
async function startOn(
  input: PlanInput,
  device: LaDeviceRow,
  seq: number,
  { frame, staleAt, relevance }: Frame,
): Promise<LaSend[] | null> {
  const { tx, kind, refId, snapshot, now } = input;
  const spec = LA_KIND_SPECS[kind];
  const android = device.platform === 'android';
  if (!device.la_on || (android ? device.fcm_token === null : device.start_token === null)) {
    return null;
  }
  // An iPhone whose build cannot draw the kind would show a blank activity.
  if (!android && device.start_drawn !== true && !LA_BASELINE_IOS_KINDS.includes(kind)) {
    return null;
  }
  const slots = await slotsOn(tx, device.device_id);
  const admission = admitActivity(slots, { kind, refId });
  if (!admission.admit) return null;
  const victims = admission.evict.flatMap(
    (e) => slots.find((slot) => slot.kind === e.kind && slot.refId === e.refId) ?? [],
  );
  const sends = await evict(tx, victims, now);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO device_activities (device_id, user_id, trip_id, kind, ref_id, started_via, state,
       stale_at, ends_at, last_content_version, last_sent_at, restart_count)
     VALUES ($1, $2, $3, $4, $5, 'push_to_start', 'pending', $6, $7, $8, $9,
       coalesce((SELECT max(restart_count) + 1 FROM device_activities
                  WHERE device_id = $1 AND kind = $4 AND ref_id = $5 AND end_reason = 'restart'), 0))
     RETURNING id`,
    [
      device.device_id,
      device.user_id,
      snapshot.tripId,
      kind,
      refId,
      staleAt,
      snapshot.endsAt,
      seq,
      now,
    ],
  );
  const rowId = rows[0]?.id;
  if (rowId === undefined) return sends;
  const attributes = await snapshot.attributes(device.locale);
  const common = { event: 'start' as const, contentState: frame, relevance, staleAt };
  if (android && device.fcm_token !== null) {
    const token = device.fcm_token;
    sends.push({ ...common, priority: 5, via: 'fcm', rowId, token, kind, refId, attributes });
  } else if (device.start_token !== null && device.start_env !== null) {
    sends.push({
      ...common,
      via: 'start',
      rowId,
      token: device.start_token,
      env: device.start_env,
      bundleId: device.bundle_id,
      priority: 10,
      attributesType: spec.attributesType,
      attributes,
      alert: await renderAlert(input.render, device.locale, snapshot.startAlert),
      channel: spec.broadcast,
    });
  }
  return sends;
}

/** Plans a live object's frame for every device; the caller persists `seq` and the frame. */
export async function planLive(input: PlanInput): Promise<LaPlan> {
  const { tx, kind, refId, snapshot, now } = input;
  const spec = LA_KIND_SPECS[kind];
  const changed = !sameFrame(input.prev, snapshot.state(input.seq));
  const seq = changed ? input.seq + 1 : input.seq;
  const at: Frame = {
    frame: snapshot.state(seq),
    staleAt: new Date(now.getTime() + spec.staleAfterMs),
    relevance: 100 - spec.rank * 10,
  };
  const sends: LaSend[] = [];

  const rows = await liveRows(tx, kind, refId);
  const audience = new Set(snapshot.audience);
  const gone = rows.filter((row) => !audience.has(row.user_id));
  sends.push(...endSends(gone, at.frame, now, at.relevance));
  await markEnded(
    tx,
    gone.map((row) => row.id),
    'left_audience',
    now,
  );
  const staying = rows.filter((row) => audience.has(row.user_id));
  const showing = new Set(staying.map((row) => row.device_id));
  const devices = await audienceDevices(
    tx,
    kind,
    refId,
    snapshot.audience,
    input.defaultBundleId,
    now,
  );

  if (changed) {
    const urgency = snapshot.urgency(input.prev, at.frame);
    sends.push(...(await updateSends(input, staying, devices, urgency, at)));
  }

  let fallbacks = 0;
  const starters = new Set(snapshot.startAudience ?? snapshot.audience);
  for (const device of devices) {
    if (showing.has(device.device_id) || device.blocked || !starters.has(device.user_id)) continue;
    const started = await startOn(input, device, seq, at);
    if (started === null) fallbacks += 1;
    else sends.push(...started);
  }
  return { sends, seq, fallbacks, frame: at.frame };
}
