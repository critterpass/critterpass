/**
 * Console operators and `set_admin_role` (owner only). Operators are `auth.user` rows holding at
 * least one console role; their roles live in Better Auth's `role` column and are read fresh on
 * every console request, so a change applies on the operator's next call. An owner cannot remove
 * their own owner role (someone must always be able to fix access).
 */
import {
  DomainError,
  operatorsResponseSchema,
  parseAdminRoles,
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
  setRoles(uid: string, roles: readonly AdminRole[]): Promise<void>;
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
    async setRoles(uid, roles) {
      await authPool.query('UPDATE auth."user" SET role = $2, updated_at = now() WHERE id = $1', [
        uid,
        serializeAdminRoles(roles),
      ]);
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
        area: 'audit',
        summary: 'Console operators and their roles (owner only)',
        response: operatorsResponseSchema,
        run: async ({ admin }) => {
          if (!admin.roles.includes('owner'))
            throw new DomainError('FORBIDDEN', { reason: 'role' });
          const operators = await deps.operators.list();
          return {
            items: operators.map((operator) => ({
              uid: operator.id,
              email: operator.email,
              name: operator.name,
              roles: [...operator.roles],
              allow_listed: deps.allowlist.allows(operator.email),
            })),
          };
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'set_admin_role',
        schema: setAdminRolePayloadSchema,
        audit: (payload) => ({
          targetKind: 'operator',
          targetId: payload.uid,
          reason: payload.reason,
          detail: { roles: payload.roles },
        }),
        handle: async (_tx, payload, ctx) => {
          const operator = await deps.operators.byId(payload.uid);
          if (operator === null || !deps.allowlist.allows(operator.email)) {
            throw new DomainError('NOT_FOUND');
          }
          if (payload.uid === ctx.admin.uid && !payload.roles.includes('owner')) {
            throw new DomainError('STATE_INVALID', { reason: 'own_owner_role' });
          }
          await deps.operators.setRoles(payload.uid, payload.roles);
          return { uid: payload.uid, roles: payload.roles };
        },
      }),
    ],
  });
}
