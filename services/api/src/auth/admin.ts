/**
 * Admin roles, permission sets, and the audit hook (docs/product-decisions.md; this phase's
 * Requirements table: "Better Auth admin plugin roles admin, support, content; impersonation
 * disabled in prod; every admin action → ops.admin_audit"). `admin` keeps Better Auth's own default
 * full-access permission set; `support` can look up and ban a problem account and revoke its
 * sessions but never delete/create a user, change credentials, or impersonate; `content` can only
 * look users up for moderation context (no session or account-mutating permission at all).
 */
import { withSystem } from '@cp/db';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';
import type pg from 'pg';

const ac = createAccessControl(defaultStatements);

/** Every permission Better Auth's own built-in `admin` role has, minus `impersonate` in production (no built-in flag disables impersonation outright). */
function adminUserPermissions(allowImpersonation: boolean): string[] {
  const base = [
    'create',
    'list',
    'set-role',
    'ban',
    'delete',
    'set-password',
    'set-email',
    'get',
    'update',
  ];
  return allowImpersonation ? [...base, 'impersonate'] : base;
}

export function buildAdminRoles(deps: { allowImpersonation: boolean }) {
  return {
    admin: ac.newRole({
      user: adminUserPermissions(deps.allowImpersonation) as never,
      session: ['list', 'revoke', 'delete'],
    }),
    support: ac.newRole({
      user: ['list', 'get', 'ban'],
      session: ['list', 'revoke'],
    }),
    content: ac.newRole({
      user: ['list', 'get'],
      session: [],
    }),
  };
}

export const ADMIN_ROLE_NAMES = ['admin', 'support', 'content'] as const;

export interface AdminPluginConfig {
  readonly ac: typeof ac;
  readonly roles: ReturnType<typeof buildAdminRoles>;
  readonly adminRoles: string[];
}

/** `isProduction` gates impersonation only — never a client-supplied value, matching the attestation-mode convention (server config decides, not the request). */
export function buildAdminPluginConfig(isProduction: boolean): AdminPluginConfig {
  return {
    ac,
    roles: buildAdminRoles({ allowImpersonation: !isProduction }),
    adminRoles: [...ADMIN_ROLE_NAMES],
  };
}

interface AdminActionRequestBody {
  readonly userId?: string;
  readonly banReason?: string;
}

const ADMIN_PATH_PREFIX = '/admin/';

async function writeAdminAudit(
  pool: pg.Pool,
  entry: { adminId: string; action: string; targetId: string | null; reason: string | null },
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO ops.admin_audit (admin_id, action, target_kind, target_id, reason)
       VALUES ($1, $2, 'user', $3, $4)`,
      [entry.adminId, entry.action, entry.targetId, entry.reason],
    ),
  );
}

export interface AdminAuditHookContext {
  readonly path: string;
  readonly body?: unknown;
  readonly context: { readonly session?: { readonly user: { readonly id: string } } | null };
}

/**
 * Writes one `ops.admin_audit` row for every successful `/admin/*` call (`ban-user`, `set-role`,
 * `impersonate-user`, `remove-user`, ...). A plain function (not its own `createAuthMiddleware`
 * wrapper) so `hooks.ts`'s single composed `hooks.after` can call it alongside the other after-hook
 * behaviors — Better Auth accepts exactly one `hooks.after` function, not a matcher array. Only ever
 * sees a request Better Auth's own admin endpoint already accepted, so nothing here can log an action
 * that did not really happen.
 */
export async function maybeWriteAdminAudit(
  ctx: AdminAuditHookContext,
  appPool: pg.Pool,
): Promise<void> {
  if (!ctx.path.startsWith(ADMIN_PATH_PREFIX)) return;
  const adminId = ctx.context.session?.user.id;
  if (!adminId) return;
  const body = ctx.body as AdminActionRequestBody | undefined;
  await writeAdminAudit(appPool, {
    adminId,
    action: ctx.path,
    targetId: body?.userId ?? null,
    reason: body?.banReason ?? null,
  });
}
