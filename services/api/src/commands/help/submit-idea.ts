/**
 * `submit_idea` (offline): a suggestion for the board. It waits in `pending_review`, seen by its
 * author as "Under review", until the team publishes it. Titles with contact details, links or a
 * blocked word are refused so nothing personal or abusive reaches the review queue.
 */
import { BLOCKED_NAME_WORDS } from '@cp/content/onboarding';
import { emitEvent } from '@cp/db';
import { detectPatterns, DomainError, hasBlockedWord, submitIdeaPayloadSchema } from '@cp/domain';

import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

export const submitIdeaCommand = defineCommand({
  name: 'submit_idea',
  v: 1,
  schema: submitIdeaPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const existing = await tx.query<{ author_id: string | null; status: string }>(
        'SELECT author_id, status FROM ideas WHERE id = $1',
        [payload.id],
      );
      const found = existing.rows[0];
      if (found !== undefined) {
        if (found.author_id !== ctx.uid) {
          throw new DomainError('IDEMPOTENCY_MISMATCH', { reason: 'idea_id' });
        }
        return { idea_id: payload.id, status: found.status };
      }
      const text = [payload.title, payload.description ?? ''].join('\n');
      if (detectPatterns(text).length > 0) {
        throw new DomainError('CONTENT_REJECTED', { reason: 'personal_info' });
      }
      if (hasBlockedWord(text, BLOCKED_NAME_WORDS)) {
        throw new DomainError('CONTENT_REJECTED', { reason: 'blocked_word' });
      }
      await tx.query(
        `INSERT INTO ideas (id, author_id, title, description, locale)
         VALUES ($1, $2, $3, $4, $5)`,
        [payload.id, ctx.uid, payload.title, payload.description, payload.locale],
      );
      await emitEvent(tx, {
        type: 'idea.submitted',
        aggregateKind: 'idea',
        aggregateId: payload.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { idea_id: payload.id, author_id: ctx.uid, locale: payload.locale },
      });
      return { idea_id: payload.id, status: 'pending_review' };
    }),
});
