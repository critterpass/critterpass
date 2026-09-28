/**
 * Console operators, `set_admin_role` and `revoke_admin_sessions` (owner only). Operators are
 * `auth.user` rows holding at least one console role; their roles live in Better Auth's `role`
 * column and are read fresh on every console request, so a change applies on the operator's next
 * call. The last owner can never lose the owner role, and an owner cannot remove their own (someone
 * must always be able to fix access). Clearing every role ends the person's console sessions
 * (`auth.session.console`) in the same transaction; their app sessions are untouched.
 */
import {
  DomainError,
  consoleOperatorsResponseSchema,
  parseAdminRoles,
  revokeAdminSessionsPayloadSchema,
  serializeAdminRoles,
  setAdminRolePayloadSchema,
  type AdminRole,
} from '@cp/domain';
import type pg from 'pg';

import type { AdminAllowlist } from './allowlist';
import type { AdminSessionUser } from './auth-guard';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

export interface OperatorRecord extends AdminSessionUser {
  readonly roles: readonly AdminRole[];
}

export interface OperatorStore {
  byEmail(email: string): Promise<OperatorRecord | null>;
  byId(uid: string): Promise<OperatorRecord | null>;
  /** Every account that holds, or held, a console role. */
  list(): Promise<readonly OperatorRecord[]>;
  /** Sets the roles; with `endConsoleSessions`, deletes their console sessions in the same transaction. */
  setRoles(
    uid: string,
    roles: readonly AdminRole[],
    options?: { readonly endConsoleSessions?: boolean },
  ): Promise<void>;
  /** Deletes the account's console sessions (never app sessions); returns how many ended. */
  endConsoleSessions(uid: string): Promise<number>;
  /** Last console sign-in and live console session count per account. */
  consoleActivity(
    uids: readonly string[],
  ): Promise<ReadonlyMap<string, { readonly lastSignIn: Date | null; readonly live: number }>>;
}

interface OperatorRow {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean;
}

const toRecord = (row: OperatorRow): OperatorRecord => ({
  ...row,
  roles: parseAdminRoles(row.role),
});

/** Over the auth database (the `auth` role's pool); console accounts only (`role IS NOT NULL`). */
export function createOperatorStore(authPool: pg.Pool): OperatorStore {
  const one = async (where: string, value: string) => {
    const { rows } = await authPool.query<OperatorRow>(
      `SELECT id, email, name, role, banned FROM auth."user" WHERE ${where} AND role IS NOT NULL`,
      [value],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  };
  return {
    byEmail: (email) => one('lower(email) = lower($1)', email),
    byId: (uid) => one('id = $1', uid),
    async list() {
      const { rows } = await authPool.query<OperatorRow>(
        'SELECT id, email, name, role, banned FROM auth."user" WHERE role IS NOT NULL ORDER BY email',
      );
      return rows.map(toRecord);
    },
    async setRoles(uid, roles, options = {}) {
      const client = await authPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE auth."user" SET role = $2, updated_at = now() WHERE id = $1', [
          uid,
          serializeAdminRoles(roles),
        ]);
        if (options.endConsoleSessions === true) {
          await client.query('DELETE FROM auth.session WHERE user_id = $1 AND console', [uid]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async endConsoleSessions(uid) {
      const result = await authPool.query(
        'DELETE FROM auth.session WHERE user_id = $1 AND console',
        [uid],
      );
      return result.rowCount ?? 0;
    },
    async consoleActivity(uids) {
      if (uids.length === 0) return new Map();
      const { rows } = await authPool.query<{ user_id: string; last: Date | null; live: number }>(
        `SELECT user_id, max(created_at) AS last,
                count(*) FILTER (WHERE expires_at > now())::int AS live
         FROM auth.session WHERE console AND user_id = ANY($1::uuid[]) GROUP BY user_id`,
        [uids],
      );
      return new Map(rows.map((row) => [row.user_id, { lastSignIn: row.last, live: row.live }]));
    },
  };
}

export interface OperatorsAreaDeps {
  readonly operators: OperatorStore;
  readonly allowlist: AdminAllowlist;
}

export function operatorsArea(deps: OperatorsAreaDeps) {
  return defineAdminArea({
    id: 'operators',
    reads: [
      defineAdminRead({
        path: '/operators',
        area: 'operators',
        summary: 'Console operators, their roles and console sessions, and invited e-mails',
        response: consoleOperatorsResponseSchema,
        run: async () => {
          const operators = await deps.operators.list();
          const activity = await deps.operators.consoleActivity(operators.map((op) => op.id));
          const known = new Set(operators.map((operator) => operator.email.toLowerCase()));
          return {
            items: operators.map((operator) => ({
              uid: operator.id,
              email: operator.email,
              name: operator.name,
              roles: [...operator.roles],
              allow_listed: deps.allowlist.allows(operator.email),
              last_console_sign_in_at: activity.get(operator.id)?.lastSignIn?.toISOString() ?? null,
              console_sessions: activity.get(operator.id)?.live ?? 0,
            })),
            invited: (deps.allowlist.entries?.() ?? [])
              .filter((entry) => !known.has(entry.email))
              .map((entry) => ({
                email: entry.email,
                roles: [...entry.roles],
                last_console_sign_in_at: null,
              })),
          };
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'set_admin_role',
        schema: setAdminRolePayloadSchema,
        audit: (payload, result: { before: readonly AdminRole[]; email: string }) => ({
          targetKind: 'operator',
          targetId: payload.uid,
          reason: payload.reason,
          detail: { roles: payload.roles },
          summary: `${result.email} · ${roleLabel(result.before)} → ${roleLabel(payload.roles)}`,
          changes: [{ field: 'roles', before: [...result.before], after: [...payload.roles] }],
        }),
        handle: async (_tx, payload, ctx) => {
          const operator = await deps.operators.byId(payload.uid);
          if (operator === null || !deps.allowlist.allows(operator.email)) {
            throw new DomainError('NOT_FOUND');
          }
          if (operator.roles.includes('owner') && !payload.roles.includes('owner')) {
            const owners = (await deps.operators.list()).filter(
              (other) =>
                other.id !== payload.uid &&
                other.roles.includes('owner') &&
                other.banned !== true &&
                deps.allowlist.allows(other.email),
            );
            if (owners.length === 0) {
              throw new DomainError('STATE_INVALID', { reason: 'last_owner' });
            }
          }
          if (payload.uid === ctx.admin.uid && !payload.roles.includes('owner')) {
            throw new DomainError('STATE_INVALID', { reason: 'own_owner_role' });
          }
          await deps.operators.setRoles(payload.uid, payload.roles, {
            endConsoleSessions: payload.roles.length === 0,
          });
          return {
            uid: payload.uid,
            roles: payload.roles,
            before: operator.roles,
            email: operator.email,
          };
        },
      }),
      defineAdminCommand({
        name: 'revoke_admin_sessions',
        schema: revokeAdminSessionsPayloadSchema,
        audit: (payload, result: { ended: number; email: string }) => ({
          targetKind: 'operator',
          targetId: payload.uid,
          reason: payload.reason,
          summary: `${result.email} · ended ${result.ended} console session${result.ended === 1 ? '' : 's'}`,
          changes: [{ field: 'console_sessions', before: result.ended, after: 0 }],
        }),
        handle: async (_tx, payload) => {
          const operator = await deps.operators.byId(payload.uid);
          if (operator === null) throw new DomainError('NOT_FOUND');
          const ended = await deps.operators.endConsoleSessions(payload.uid);
          return { uid: payload.uid, ended, email: operator.email };
        },
      }),
    ],
  });
}

function roleLabel(roles: readonly AdminRole[]): string {
  return roles.length === 0 ? 'no roles' : roles.join('+');
}
