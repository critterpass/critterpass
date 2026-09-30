/**
 * The guide's reply to an @mention in crew chat (docs/api-contracts-async.md `ai.guide_mention`),
 * shared by the api's mention stream and the worker's job so both answer the same way. A mention is
 * claimed once (`guide_crew_turns.message_id`), so whichever runs first answers and the other
 * stops. The turn runs as the asker, on their meter unless a crewmate has Pass+ or the trip is
 * boosted; its tokens reach the crew on `crew_chat:{crew_id}` as `guide.token`, and the finished
 * reply is posted to the chat as the guide. Once claimed, the reply runs to the end even if the
 * asker's own stream goes away: the crew is waiting for it.
 */
import { channelName, type ComplianceResult } from '@cp/domain';

import type { Gateway } from '../../client';
import { buildContext, type RunAsGuideReader } from '../../context/build';
import type { MeterHandle } from '../../runner/meter';
import type { TurnEvent } from '../../runner/sse';
import { runTurn } from '../../runner/turn';
import type { ToolRegistry } from '../../tools/registry';
import type { RunAsSystem, SqlClient } from '../../usage';
import { chatWindow, claimMention, crewPassHolders, packFor, settle } from './crew-store';
import { detach } from './detach';
import { buildCrewMentionRequest, CREW_MENTION_ROUTE } from './mention.prompt';

export interface CrewTurnPorts {
  readonly gateway: Gateway;
  readonly registry: ToolRegistry;
  readonly runAsSystem: RunAsSystem;
  readonly runAsGuideReader: RunAsGuideReader;
  readonly redactKeys: readonly string[];
  /** Queues one realtime event (rt_outbox) in the given transaction. */
  readonly publish: (
    tx: SqlClient,
    channel: string,
    type: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
  /** Reserves the asker's answer (throws `QUOTA_EXHAUSTED` when their free meter is spent). */
  readonly reserve: (input: {
    readonly uid: string;
    readonly tripId: string | null;
    readonly crewPassHolders: readonly string[];
  }) => Promise<MeterHandle>;
  readonly inputCheck?: (text: string) => Promise<ComplianceResult>;
  /** Token flush interval to the crew (default 300 ms). */
  readonly flushMs?: number;
}

export interface MentionClaim {
  readonly turnId: string;
  readonly messageId: string;
  readonly crewId: string;
  readonly tripId: string | null;
  readonly askerId: string;
  readonly body: string;
  readonly guideId: string | null;
  readonly guideSlug: string | null;
}

export interface PreparedMention {
  readonly claim: MentionClaim;
  /** The reply's events; drained to the end even when the reader stops early. */
  readonly events: AsyncGenerator<TurnEvent, void, undefined>;
}

/**
 * Claims and reserves a mention reply. Null: nothing to answer. Throws before any event when the
 * asker's meter is spent (`QUOTA_EXHAUSTED`); the claim is then marked skipped.
 */
export async function prepareCrewMention(
  ports: CrewTurnPorts,
  messageId: string,
  replyId: string,
): Promise<PreparedMention | null> {
  const claim = await claimMention(ports.runAsSystem, messageId);
  if (claim === null) return null;
  let meter: MeterHandle;
  try {
    const holders = await crewPassHolders(ports.runAsSystem, claim.crewId, claim.askerId);
    meter = await ports.reserve({
      uid: claim.askerId,
      tripId: claim.tripId,
      crewPassHolders: holders,
    });
  } catch (error) {
    await settle(ports, claim, 'skipped');
    throw error;
  }
  return { claim, events: detach(mentionEvents(ports, claim, meter, replyId)) };
}

async function* mentionEvents(
  ports: CrewTurnPorts,
  claim: MentionClaim,
  meter: MeterHandle,
  replyId: string,
): AsyncGenerator<TurnEvent, void, undefined> {
  const channel = channelName('crew_chat', claim.crewId);
  await ports.runAsSystem((tx) => ports.publish(tx, channel, 'typing', { guide: true }));
  const usage = { userId: claim.askerId, tripId: claim.tripId, crewId: claim.crewId };
  const [pack, context, window] = await Promise.all([
    packFor(ports.runAsGuideReader, claim.askerId, claim.tripId, claim.guideSlug),
    buildContext(
      { uid: claim.askerId, tripId: claim.tripId, surface: 'G' },
      { runAsGuideReader: ports.runAsGuideReader, redactKeys: ports.redactKeys },
    ),
    chatWindow(ports, claim),
  ]);
  const request = buildCrewMentionRequest({
    pack,
    tripContext: context.tripContext,
    window: window.some((line) => line.body === claim.body)
      ? window
      : [
          ...window,
          {
            seq: 0,
            author_kind: 'member',
            author_name: null,
            body: claim.body,
            created_at: new Date().toISOString(),
          },
        ],
    directives: { chattiness: context.prefs.chattiness, locale: context.prefs.locale ?? 'en' },
  });
  const events = runTurn(
    {
      route: CREW_MENTION_ROUTE,
      system: request.system,
      messages: request.messages,
      tool: { uid: claim.askerId, tripId: claim.tripId, caller: 'G' },
      usage,
      ...(ports.inputCheck === undefined ? {} : { inputCheck: ports.inputCheck(claim.body) }),
    },
    { gateway: ports.gateway, registry: ports.registry, meter },
  );

  let text = '';
  let pending = '';
  let seq = 0;
  let last = Date.now();
  let settled = false;
  const flush = async (force: boolean) => {
    if (pending === '' || (!force && Date.now() - last < (ports.flushMs ?? 300))) return;
    const chunk = pending;
    pending = '';
    last = Date.now();
    await ports.runAsSystem((tx) =>
      ports.publish(tx, channel, 'guide.token', { stream_id: replyId, seq: seq++, text: chunk }),
    );
  };
  try {
    for await (const event of events) {
      if (event.type === 'token') {
        text += event.text;
        pending += event.text;
        await flush(false);
      } else if (event.type === 'done') {
        await flush(true);
        await settle(ports, claim, 'answered', {
          id: replyId,
          text,
          metered: meter.reservation.metered,
        });
        settled = true;
      } else if (event.type === 'error') {
        await settle(ports, claim, 'failed');
        settled = true;
      }
      yield event;
    }
  } finally {
    if (!settled) await settle(ports, claim, 'failed');
  }
}
