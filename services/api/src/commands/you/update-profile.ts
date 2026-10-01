/**
 * `update_profile` (3n-3, docs/api-contracts.md §4.1): name, username and spoken languages.
 *
 * - A name follows the pass's given-name rules; a blocked word is `CONTENT_REJECTED`.
 * - A username follows `usernameProblem` (`VALIDATION {field: username, reason}`), may change once
 *   every 30 days (`STATE_INVALID {reason: username_cooldown, until}`), and is unique regardless
 *   of case: of two users racing for the same name one wins, the other gets
 *   `STATE_INVALID {reason: username_taken}`.
 * - Languages are deduplicated in the order given.
 */
import { BLOCKED_NAME_WORDS } from '@cp/content/onboarding';
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  givenNameProblem,
  normalizeGivenName,
  normalizeUsername,
  updateProfilePayloadSchema,
  usernameCooldownUntil,
  usernameProblem,
  type ProfileField,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { announceMemberUpdated } from '../onboarding/member-updated';

const PG_UNIQUE_VIOLATION = '23505';

export interface UpdateProfileResult {
  readonly display_name: string | null;
  readonly username: string | null;
  readonly languages: readonly string[];
  readonly username_changed_at: string | null;
  readonly changed: readonly ProfileField[];
}

interface ProfileRow {
  display_name: string | null;
  username: string | null;
  languages: string[];
  username_changed_at: Date | null;
}

function checkedName(raw: string): string {
  const name = normalizeGivenName(raw);
  const problem = givenNameProblem(name, BLOCKED_NAME_WORDS);
  if (problem === 'blocked') throw new DomainError('CONTENT_REJECTED', { field: 'name' });
  if (problem !== null) throw new DomainError('VALIDATION', { field: 'name', reason: problem });
  return name;
}

function checkedUsername(raw: string): string {
  const username = normalizeUsername(raw);
  const problem = usernameProblem(username);
  if (problem !== null) throw new DomainError('VALIDATION', { field: 'username', reason: problem });
  return username;
}

async function writeUsername(tx: pg.PoolClient, uid: string, username: string): Promise<void> {
  await tx.query('SAVEPOINT update_profile_username');
  try {
    await tx.query('UPDATE users SET username = $2, username_changed_at = now() WHERE id = $1', [
      uid,
      username,
    ]);
    await tx.query('RELEASE SAVEPOINT update_profile_username');
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT update_profile_username');
    if ((error as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
      throw new DomainError('STATE_INVALID', { reason: 'username_taken' });
    }
    throw error;
  }
}

export const updateProfileCommand = defineCommand({
  name: 'update_profile',
  v: 1,
  schema: updateProfilePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (_tx, payload) => {
    if (payload.name !== undefined) checkedName(payload.name);
    if (payload.username !== undefined) checkedUsername(payload.username);
    return Promise.resolve();
  },
  handle: async (tx, payload, ctx): Promise<UpdateProfileResult> => {
    const { rows } = await tx.query<ProfileRow>(
      `SELECT display_name, username::text AS username, languages, username_changed_at
         FROM users WHERE id = $1 FOR UPDATE`,
      [ctx.uid],
    );
    const current = rows[0];
    if (current === undefined) throw new DomainError('NOT_FOUND', { reason: 'no_profile' });
    const changed: ProfileField[] = [];

    if (payload.name !== undefined) {
      const name = checkedName(payload.name);
      if (name !== current.display_name) {
        await tx.query('UPDATE users SET display_name = $2 WHERE id = $1', [ctx.uid, name]);
        current.display_name = name;
        changed.push('display_name');
      }
    }

    if (payload.username !== undefined) {
      const username = checkedUsername(payload.username);
      if (username !== current.username) {
        const until = usernameCooldownUntil(current.username_changed_at, ctx.clock.serverNow);
        if (until !== null) {
          throw new DomainError('STATE_INVALID', {
            reason: 'username_cooldown',
            until: until.toISOString(),
          });
        }
        await writeUsername(tx, ctx.uid, username);
        current.username = username;
        current.username_changed_at = ctx.clock.serverNow;
        changed.push('username');
      }
    }

    if (payload.languages !== undefined) {
      const languages = [...new Set(payload.languages)];
      if (languages.join(',') !== current.languages.join(',')) {
        await tx.query('UPDATE users SET languages = $2 WHERE id = $1', [ctx.uid, languages]);
        current.languages = languages;
        changed.push('languages');
      }
    }

    if (changed.length > 0) {
      await appendDomainEvent(tx, {
        type: 'profile.updated',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, fields: changed },
      });
      if (changed.includes('display_name')) {
        await announceMemberUpdated(tx, ctx.uid, ['display_name']);
      }
    }

    return {
      display_name: current.display_name,
      username: current.username,
      languages: current.languages,
      username_changed_at: current.username_changed_at?.toISOString() ?? null,
      changed,
    };
  },
});
