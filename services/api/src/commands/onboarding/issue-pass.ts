/**
 * `issue_pass` (docs/api-contracts.md §4.1): the end of the pass flow, online or replayed from the
 * offline queue. In one transaction it issues the caller's pass (the number `start_pass` reserved,
 * or the next one), inks the home stamp, writes the taste profile and the avatar, and fills the
 * profile fields (display name, home airport, country and currency, current avatar).
 *
 * Idempotent per user: a pass that is already issued is returned as it is, so a replay after
 * `start_pass`, or a second device's late issue, still leaves exactly one pass. Later changes go
 * through `set_taste`, `set_home_airport` and `set_avatar`.
 */
import { BLOCKED_NAME_WORDS } from '@cp/content/onboarding';
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  generateUuidV7,
  givenNameProblem,
  issuePassPayloadSchema,
  normalizeGivenName,
  type IssuePassResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { authorizeAvatarChoice, writeAvatar } from '../avatar/set-avatar';
import { announceMemberUpdated } from './member-updated';
import { requireHomeBase, writeHomeAirport } from './set-home-airport';
import { writeTasteProfile } from './set-taste';

function checkGivenName(name: string): string {
  const problem = givenNameProblem(name, BLOCKED_NAME_WORDS);
  if (problem === 'blocked') throw new DomainError('CONTENT_REJECTED', { field: 'given_name' });
  if (problem !== null) throw new DomainError('VALIDATION', { reason: `given_name_${problem}` });
  return normalizeGivenName(name);
}

export const issuePassCommand = defineCommand({
  name: 'issue_pass',
  v: 1,
  schema: issuePassPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    checkGivenName(payload.given_name);
    requireHomeBase(payload.home_iata);
    await authorizeAvatarChoice(tx, ctx.uid, payload.avatar);
  },
  handle: async (tx, payload, ctx): Promise<IssuePassResult> => {
    const { rows } = await tx.query<{
      id: string;
      number: string;
      issued_at: Date;
      newly: boolean;
    }>('SELECT id, number, issued_at, newly FROM app.issue_pass($1)', [payload.pass_id]);
    const pass = rows[0];
    if (pass === undefined) throw new Error('app.issue_pass returned no row');
    const result: IssuePassResult = {
      pass_id: pass.id,
      number: pass.number,
      issued_at: pass.issued_at.toISOString(),
    };
    if (!pass.newly) return result;

    await tx.query('UPDATE users SET display_name = $2 WHERE id = $1', [
      ctx.uid,
      checkGivenName(payload.given_name),
    ]);
    await writeHomeAirport(tx, ctx.uid, requireHomeBase(payload.home_iata));
    await writeTasteProfile(tx, ctx.uid, payload.taste_answers, 'quiz');
    await writeAvatar(tx, ctx.uid, generateUuidV7(), payload.avatar);

    await appendDomainEvent(tx, {
      type: 'pass.issued',
      aggregateKind: 'pass',
      aggregateId: pass.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { pass_id: pass.id, user_id: ctx.uid },
    });
    await announceMemberUpdated(tx, ctx.uid, ['pass', 'display_name', 'home_airport', 'taste']);
    return result;
  },
});
