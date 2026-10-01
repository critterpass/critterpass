/**
 * Commands that act on the caller's own install (`devices.id`) read it from the envelope's
 * `device.id`. Shipped app builds keep two ids per install: the one `register_device` creates the
 * row under and the one every other command carries, so on those builds the envelope id of these
 * commands matches no row and each was refused (`NOT_FOUND device_not_registered`).
 *
 * `onRegisteredInstall` runs such a command against the row the caller did register: when the
 * envelope id matches no `devices` row at all, the hooks see the caller's own most recently seen
 * device on the envelope's platform instead. An id that matches a row is never replaced (so
 * another person's install still reads as foreign), and a caller without any device on that
 * platform keeps the envelope id, which the command refuses as before.
 *
 * A person with two phones on one platform: the stand-in is whichever phone checked in last
 * (`register_device` runs on every launch and foreground), which is the phone sending the command
 * in all but a race between both phones inside one heartbeat.
 */
import type { DbCommandDefinition } from '@cp/db';
import type { CommandContext } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** Commands keyed by the caller's install. */
export const INSTALL_KEYED_COMMANDS: ReadonlySet<string> = new Set([
  'update_device_permissions',
  'register_la_token',
  'report_la_state',
  'register_widget_token',
  'sync_installed_widgets',
]);

export interface InstallStandIn {
  readonly cmd: string;
  readonly platform: string;
}

/** Told once per command that ran on a stand-in device (for the log; never ids). */
export type InstallStandInReporter = (standIn: InstallStandIn) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The registered device this command should act on: the envelope's own, else the stand-in. */
export async function resolveRegisteredInstall(
  tx: pg.PoolClient,
  ctx: Pick<CommandContext, 'uid' | 'device'>,
): Promise<{ readonly deviceId: string; readonly standIn: boolean }> {
  const envelopeId = ctx.device.id;
  return asSystemRole(tx, async () => {
    if (UUID.test(envelopeId)) {
      const known = await tx.query('SELECT 1 FROM devices WHERE id = $1', [envelopeId]);
      if (known.rowCount) return { deviceId: envelopeId, standIn: false };
    }
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM devices WHERE user_id = $1 AND platform = $2
       ORDER BY last_seen_at DESC, id LIMIT 1`,
      [ctx.uid, ctx.device.platform],
    );
    const own = rows[0];
    return own === undefined
      ? { deviceId: envelopeId, standIn: false }
      : { deviceId: own.id, standIn: true };
  });
}

/** Wraps an install-keyed command so every hook sees the caller's registered device id. */
export function onRegisteredInstall<Payload, Result>(
  definition: DbCommandDefinition<Payload, Result>,
  report?: InstallStandInReporter,
): DbCommandDefinition<Payload, Result> {
  // One lookup per op: the pipeline hands the same context to authorize, entitle and handle.
  const resolved = new WeakMap<CommandContext, Promise<CommandContext>>();
  const registered = (tx: pg.PoolClient, ctx: CommandContext): Promise<CommandContext> => {
    let pending = resolved.get(ctx);
    if (pending === undefined) {
      pending = resolveRegisteredInstall(tx, ctx).then(({ deviceId, standIn }) => {
        if (!standIn) return ctx;
        report?.({ cmd: ctx.cmd, platform: ctx.device.platform });
        return { ...ctx, device: { ...ctx.device, id: deviceId } };
      });
      resolved.set(ctx, pending);
    }
    return pending;
  };
  return {
    ...definition,
    authorize: async (tx, payload, ctx) =>
      definition.authorize(tx, payload, await registered(tx, ctx)),
    entitle: async (tx, payload, ctx) => definition.entitle(tx, payload, await registered(tx, ctx)),
    handle: async (tx, payload, ctx) => definition.handle(tx, payload, await registered(tx, ctx)),
  };
}
