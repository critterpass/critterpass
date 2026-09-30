/**
 * `choose_private_option` (doc delta, docs/api-contracts-proposal.md): the member picks one of the
 * options their private thread offered. "Ask the crew" writes the nameless line through
 * `app.write_anonymous_suggestion`, which the database refuses in a crew under four; a personal
 * saving is kept on the thread and carried into their RSVP as a chosen option.
 */
import { sendInTx } from '@cp/db';
import { chooseObjectionOptionPayloadSchema, DomainError, PROPOSAL_QUEUES } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import type { ObjectionOption } from './objection-options';

interface ThreadRow {
  readonly id: string;
  readonly proposal_id: string;
  readonly offered_options: readonly ObjectionOption[];
}

async function ownThread(tx: Parameters<typeof sendInTx>[0], threadId: string): Promise<ThreadRow> {
  const { rows } = await tx.query<ThreadRow>(
    'SELECT id, proposal_id, offered_options FROM private_guide_threads WHERE id = $1',
    [threadId],
  );
  const thread = rows[0];
  if (thread === undefined) throw new DomainError('NOT_FOUND', { reason: 'thread' });
  return thread;
}

export const choosePrivateOptionCommand = defineCommand({
  name: 'choose_private_option',
  v: 1,
  schema: chooseObjectionOptionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const thread = await ownThread(tx, payload.thread_id);
    if (!thread.offered_options.some((option) => option.id === payload.option_id)) {
      throw new DomainError('VALIDATION', { field: 'option_id', reason: 'not_offered' });
    }
  },
  handle: async (tx, payload) => {
    const thread = await ownThread(tx, payload.thread_id);
    const option = thread.offered_options.find((o) => o.id === payload.option_id);
    if (option === undefined) throw new DomainError('VALIDATION', { field: 'option_id' });
    let suggestionId: string | null = null;
    if (option.kind === 'ask_crew') {
      try {
        const { rows } = await tx.query<{ id: string }>(
          'SELECT app.write_anonymous_suggestion($1) AS id',
          [thread.id],
        );
        suggestionId = rows[0]?.id ?? null;
      } catch (error) {
        if ((error as { code?: string }).code === '23514') {
          throw new DomainError('K_ANON_UNAVAILABLE', { min_crew: 4 });
        }
        throw error;
      }
    }
    await asSystemRole(tx, async () => {
      await tx.query('UPDATE private_guide_threads SET chosen_option = $2 WHERE id = $1', [
        thread.id,
        option.id,
      ]);
      if (suggestionId !== null) {
        await sendInTx(
          tx,
          PROPOSAL_QUEUES.suggestions,
          { proposal_id: thread.proposal_id },
          { singletonKey: thread.proposal_id },
        );
      }
    });
    return { thread_id: thread.id, option_id: option.id, anonymous: suggestionId !== null };
  },
});
