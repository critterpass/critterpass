/**
 * The guide in crew chat from the api (docs/api-contracts.md §5.3 `POST /v1/guide/crew/{crew_id}/
 * mentions`): the asker's app streams the reply to its own mention while the crew sees it on
 * `crew_chat:{crew_id}`. The same mention is also queued for the worker (`ai.guide_mention`) when
 * it is sent, a little later, for a mention sent offline or an app that never asked; whichever
 * claims it first answers.
 */
import {
  logToolMarkup,
  prepareCrewMention,
  SSE_HEADERS,
  sseStream,
  type CrewTurnPorts,
  type Gateway,
  type ToolRegistry,
} from '@cp/ai';
import { outbox, sendInTx, withSystem, withUser, type KillSwitchReader } from '@cp/db';
import { DomainError, generateUuidV7, GUIDE_QUEUES, type GuideMentionJob } from '@cp/domain';
import type pg from 'pg';
import type { Logger } from 'pino';

import type { ApiCompliance } from '../../ai/compliance';
import { guideReaderRunner, guideRedactionKeys } from '../../ai/context';
import { reserveGuideTurn } from '../../ai/guide-meter';

/** How long the worker waits before answering a mention the asker's app did not stream. */
export const MENTION_JOB_DELAY_S = 20;

export interface CrewMentionDeps {
  readonly pool: pg.Pool;
  readonly gateway: Gateway;
  readonly registry: ToolRegistry;
  readonly switches: Pick<KillSwitchReader, 'assertAiRoute'>;
  readonly compliance: Pick<ApiCompliance, 'startGuideInputCheck'>;
  readonly heartbeatMs?: number;
  /** Logs the typed event when an answer comes back with tool-call markup. */
  readonly logger?: Pick<Logger, 'warn'>;
}

export interface CrewMentionRequest {
  readonly uid: string;
  readonly device: string;
  readonly deviceTz: string;
  readonly crewId: string;
  readonly messageId: string;
}

function ports(deps: CrewMentionDeps, request: CrewMentionRequest): CrewTurnPorts {
  return {
    gateway: deps.gateway,
    registry: deps.registry,
    runAsSystem: (fn) => withSystem(deps.pool, fn),
    runAsGuideReader: guideReaderRunner(deps.pool),
    redactKeys: guideRedactionKeys(),
    publish: async (tx, channel, type, data) => {
      await outbox(tx as pg.PoolClient, channel, type, data);
    },
    reserve: (input) =>
      reserveGuideTurn(deps.pool, {
        uid: input.uid,
        device: request.device,
        deviceTz: request.deviceTz,
        tripId: input.tripId,
        isCrewChat: true,
        crewPassHolders: input.crewPassHolders,
      }),
    inputCheck: (text) =>
      deps.compliance.startGuideInputCheck(text, { userId: request.uid, crewId: request.crewId }),
    ...(deps.logger === undefined ? {} : { onToolMarkup: logToolMarkup(deps.logger) }),
  };
}

export async function streamCrewMention(
  deps: CrewMentionDeps,
  request: CrewMentionRequest,
): Promise<Response> {
  const own = await withUser(deps.pool, request.uid, request.device, (tx) =>
    tx.query(
      `SELECT 1 FROM messages
        WHERE id = $1 AND crew_id = $2 AND sender_id = $3 AND mentions_guide`,
      [request.messageId, request.crewId, request.uid],
    ),
  );
  if (own.rowCount === 0) throw new DomainError('NOT_FOUND');
  await deps.switches.assertAiRoute('guide.crew_mention');
  const prepared = await prepareCrewMention(
    ports(deps, request),
    request.messageId,
    generateUuidV7(),
  );
  if (prepared === null) {
    throw new DomainError('STATE_INVALID', { state: 'already_answered' });
  }
  const stream = sseStream(prepared.events, {
    ...(deps.heartbeatMs === undefined ? {} : { heartbeatMs: deps.heartbeatMs }),
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

/** Queues the worker's answer to a mention, in the `send_message` transaction. */
export async function enqueueGuideMention(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (event.type !== 'chat.guide_mentioned') return;
  const job: GuideMentionJob = { event_id: event.id };
  await sendInTx(tx, GUIDE_QUEUES.mention, job, {
    singletonKey: event.id,
    startAfter: MENTION_JOB_DELAY_S,
  });
}
