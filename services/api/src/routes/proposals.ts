/**
 * Proposal routes (docs/api-contracts.md §4.7, §5.3; docs/api-contracts-proposal.md): the proposal
 * commands, the `proposal:{id}` realtime namespace (anyone who can read the proposal), the private
 * objection stream `POST /v1/proposals/{id}/private/reason` and the free-text reply reader
 * `POST /v1/proposals/{id}/reply`. The objection stream runs `submit_private_reason` through the
 * one command pipeline (so a replayed op_id answers the same), then streams the guide's line and
 * the options the cost engine decided, worded by the model when it can.
 */
import {
  createGateway,
  personaIdSchema,
  recordUsage,
  SSE_HEADERS,
  writeObjectionReply,
  type Gateway,
  type ObjectionInput,
} from '@cp/ai';
import { executeCommand, sendInTx, withSystem, withUser } from '@cp/db';
import { DomainError, PROPOSAL_QUEUES } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import type { FieldKeyring } from '../commands/bookings/deps';
import { validationHook, type CommandDoorDeps } from '../commands/_framework/doors';
import { enforceUidRateLimit, requireCommandSession } from '../commands/_framework/session';
import { registerProposalCommands } from '../commands/proposal';
import { savesLabel, type ObjectionOption } from '../commands/proposal/objection-options';
import type { PrivateReasonResult } from '../commands/proposal/submit-private-reason';
import type { ApiEnv } from '../env';
import { createKillSwitches } from '../ops/kill-switches';
import { getNamespace, registerNamespace } from '../realtime/namespaces';

const PRIVATE_PER_UID_RULE = { windowSeconds: 60, max: 20 };

if (getNamespace('proposal') === undefined) {
  registerNamespace({
    name: 'proposal',
    // RLS decides: the organisers from the start, the crew once it is sent.
    acl: async (_uid, id, tx) => {
      const { rows } = await tx.query<{ allowed: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM proposals WHERE id = $1::uuid) AS allowed',
        [id],
      );
      return rows[0]?.allowed === true;
    },
    presence: false,
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  validationHook(parsed);
  return parsed.data as T;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new DomainError('VALIDATION', {
      issues: [{ path: [], message: 'The body is not JSON' }],
    });
  }
}

function sse(events: readonly (readonly [string, unknown])[]): Response {
  const encoder = new TextEncoder();
  const body = events
    .map(
      ([event, data], seq) => `id: ${seq + 1}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join('');
  return new Response(encoder.encode(body), { status: 200, headers: SSE_HEADERS });
}

export interface ProposalRouteDeps extends CommandDoorDeps {
  readonly gateway?: Pick<Gateway, 'callModel'>;
}

/**
 * The objection's wording input: the guide of the trip, the organiser's first name, the options
 * and the language the member's app is in.
 */
async function objectionInput(
  deps: ProposalRouteDeps,
  uid: string,
  proposalId: string,
  result: PrivateReasonResult,
  text: string | null,
): Promise<ObjectionInput> {
  const facts = await withUser(deps.pool, uid, 'objection', async (tx) => {
    const { rows } = await tx.query<{
      slug: string | null;
      organiser: string | null;
      locale: string;
    }>(
      `SELECT g.slug, split_part(coalesce(u.display_name, ''), ' ', 1) AS organiser,
              app.user_locale($2) AS locale
         FROM proposals p JOIN trips t ON t.id = p.trip_id
         LEFT JOIN guides g ON g.id = t.guide_id LEFT JOIN users u ON u.id = p.created_by
        WHERE p.id = $1`,
      [proposalId, uid],
    );
    return rows[0];
  });
  const guide = personaIdSchema.safeParse(facts?.slug);
  // The member's own app language: the guide answers in it, with amounts written its way.
  const locale = facts?.locale ?? 'en';
  return {
    guide: guide.success ? guide.data : 'guest',
    reason: result.reason as ObjectionInput['reason'],
    organiser: facts?.organiser ?? '',
    options: result.options.map((option: ObjectionOption) => ({
      id: option.id,
      kind: option.kind,
      label: option.label,
      saves: savesLabel(option, locale),
    })),
    text,
    locale,
  };
}

export function registerProposalRoutes(app: OpenAPIHono<AppEnv>, deps: ProposalRouteDeps): void {
  app.post('/v1/proposals/:id/private/reason', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'proposal_private', session.uid, PRIVATE_PER_UID_RULE);
    const proposalId = parse(z.uuid(), c.req.param('id'));
    const envelope = parse(
      z.looseObject({
        cmd: z.literal('submit_private_reason'),
        payload: z.looseObject({ proposal_id: z.uuid() }),
      }),
      await readJson(c.req.raw),
    );
    if (envelope.payload.proposal_id !== proposalId) {
      throw new DomainError('VALIDATION', { reason: 'proposal_path_mismatch' });
    }
    const outcome = await executeCommand(envelope, {
      pool: deps.pool,
      resolve: deps.registry.resolve,
      actor: { kind: 'user', uid: session.uid, isAnonymous: session.isAnonymous },
      door: 'cmd',
    });
    if (outcome.status === 'rejected') throw new DomainError(outcome.code, outcome.detail);
    if (outcome.status === 'duplicate' && outcome.original === 'rejected') {
      throw new DomainError(outcome.code ?? 'INTERNAL', outcome.detail);
    }
    const result = outcome.result as PrivateReasonResult;
    const payload = envelope.payload as { text?: string };
    const input = await objectionInput(deps, session.uid, proposalId, result, payload.text ?? null);
    const worded = await writeObjectionReply(deps.gateway, input, { userId: session.uid });
    const byId = new Map(result.options.map((option) => [option.id, option]));
    return sse([
      ['line', { text: worded.reply.line, source: worded.source }],
      [
        'options',
        {
          thread_id: result.thread_id,
          options: worded.reply.options.map((o) => ({ ...byId.get(o.option_id), text: o.text })),
        },
      ],
      ['done', {}],
    ]);
  });

  // A free-text reply to a proposal (a notification reply or a chat line): read in the worker; an
  // "out" only ever comes back as the sender's own confirm card, never as a dropout.
  app.post('/v1/proposals/:id/reply', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'proposal_reply', session.uid, PRIVATE_PER_UID_RULE);
    const proposalId = parse(z.uuid(), c.req.param('id'));
    const body = parse(
      z.object({ text: z.string().trim().min(1).max(500) }),
      await readJson(c.req.raw),
    );
    await withUser(deps.pool, session.uid, 'reply', async (tx) => {
      const { rows } = await tx.query(
        `SELECT 1 FROM proposal_versions v JOIN proposals p ON p.id = v.proposal_id
          WHERE v.proposal_id = $1 AND v.recipient_id = app.uid() AND p.sent_at IS NOT NULL`,
        [proposalId],
      );
      if (rows.length === 0) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_a_recipient' });
      await sendInTx(tx, PROPOSAL_QUEUES.rsvpIntent, {
        proposal_id: proposalId,
        user_id: session.uid,
        text: body.text,
      });
    });
    return c.json({ status: 'queued' }, 202);
  });
}

/** Boot wiring: the commands always; the model words objections only with a key set. */
export function registerProposals(
  app: OpenAPIHono<AppEnv>,
  doors: CommandDoorDeps,
  env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL'>,
  keyring?: FieldKeyring,
): void {
  registerProposalCommands(doors.registry, keyring === undefined ? {} : { keyring });
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          assertRouteOn: createKillSwitches(doors.pool).assertAiRoute,
          onUsage: (record) => recordUsage((fn) => withSystem(doors.pool, fn), record),
        });
  registerProposalRoutes(app, { ...doors, ...(gateway === undefined ? {} : { gateway }) });
}
