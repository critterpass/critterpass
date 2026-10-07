/**
 * The recap's api mount: its commands (views and signatures, the MVP vote, opting out of an award,
 * retrying a failed build, reacting to a year-later memory and starting a reunion vote, making and
 * switching off the recap's public link), `GET /v1/recaps/{recap_id}/links`, the live
 * channels `recap:{id}` and `memory:{id}` for the travellers who may read them, and the hook that
 * queues a recap build for the events this process appends (a trip ended here, or a late expense,
 * booking, ride or payment on a trip that already ended), the same hook the worker registers for
 * its own events.
 */
import { onEventAppended, sendInTx, withUser } from '@cp/db';
import {
  DomainError,
  isRecapBuildEvent,
  RECAP_TRIP_STATE_SQL,
  recapBuildForEvent,
  type LinkEnvironment,
  type RecapTripState,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import { aclForSql, getNamespace, registerNamespace } from '../../realtime/namespaces';
import type { CommandDoorDeps } from '../_framework/doors';
import type { CommandRegistry } from '../_framework/registry';
import { requireCommandSession } from '../_framework/session';
import { castMvpVoteCommand } from './cast-mvp-vote';
import { optOutAwardCommand } from './opt-out-award';
import { reactMemoryCommand } from './react-memory';
import { createRecapLinkCommand, readRecapLinks, revokeRecapLinkCommand } from './recap-links';
import { recordRecapViewCommand } from './record-recap-view';
import { retryRecapCommand } from './retry-recap';
import { saveSignatureCommand } from './save-signature';
import { startReunionCommand } from './start-reunion';

export async function recapEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !isRecapBuildEvent(event.type)) return;
  const { rows } = await tx.query<RecapTripState>(RECAP_TRIP_STATE_SQL, [event.tripId]);
  const request = recapBuildForEvent(event, rows[0] ?? null);
  if (request === null) return;
  await sendInTx(tx, request.queue, request.data, request.options);
}

export function registerRecapCommands(registry: CommandRegistry): void {
  registry.register(recordRecapViewCommand);
  registry.register(saveSignatureCommand);
  registry.register(castMvpVoteCommand);
  registry.register(optOutAwardCommand);
  registry.register(retryRecapCommand);
  registry.register(reactMemoryCommand);
  registry.register(startReunionCommand);
}

/** Row security decides: a recap or memory the caller can read is a channel they may join. */
function registerRecapChannels(): void {
  if (getNamespace('recap') === undefined) {
    registerNamespace({
      name: 'recap',
      acl: aclForSql('SELECT EXISTS (SELECT 1 FROM recaps WHERE id = $1::uuid) AS allowed'),
      presence: false,
    });
  }
  if (getNamespace('memory') === undefined) {
    registerNamespace({
      name: 'memory',
      acl: aclForSql('SELECT EXISTS (SELECT 1 FROM memories WHERE id = $1::uuid) AS allowed'),
      presence: false,
    });
  }
}

export function registerRecapLinkCommands(
  registry: CommandRegistry,
  linkEnv: LinkEnvironment,
): void {
  registry.register(createRecapLinkCommand(linkEnv));
  registry.register(revokeRecapLinkCommand);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `GET /v1/recaps/{recap_id}/links`: the recap's live links, for its travellers; never cached. */
export function registerRecapLinkRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
): void {
  app.get('/v1/recaps/:recapId/links', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const recapId = c.req.param('recapId');
    if (!UUID.test(recapId)) throw new DomainError('NOT_FOUND', { reason: 'recap' });
    const links = await withUser(deps.pool, uid, 'unknown', (tx) =>
      readRecapLinks(tx, recapId, uid),
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(links);
  });
}

export function registerRecap(
  app: OpenAPIHono<AppEnv>,
  doors: CommandDoorDeps,
  linkEnv: LinkEnvironment,
): void {
  registerRecapCommands(doors.registry);
  registerRecapLinkCommands(doors.registry, linkEnv);
  registerRecapLinkRoutes(app, doors);
  registerRecapChannels();
  onEventAppended(recapEventHook);
}
