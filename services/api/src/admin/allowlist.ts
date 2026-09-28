/**
 * `ADMIN_ALLOWLIST`: comma-separated `email` or `email:role+role` entries. Only listed e-mails may
 * hold a console account; roles given here seed a new account's roles once, after which roles are
 * managed with `set_admin_role`. Removing an entry locks the account out on its next request.
 */
import { adminRoleSchema, type AdminRole } from '@cp/domain';

export interface AdminAllowlist {
  allows(email: string): boolean;
  initialRoles(email: string): readonly AdminRole[];
  /** Every listed e-mail with its seed roles (the operators list shows who never signed in). */
  entries?(): readonly { readonly email: string; readonly roles: readonly AdminRole[] }[];
}

export function parseAdminAllowlist(raw: string | undefined): AdminAllowlist {
  const entries = new Map<string, readonly AdminRole[]>();
  for (const entry of (raw ?? '').split(',')) {
    const [emailPart, rolesPart] = entry.split(':');
    const email = emailPart?.trim().toLowerCase();
    if (!email) continue;
    const roles = (rolesPart ?? '')
      .split('+')
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
      .map((role) => adminRoleSchema.parse(role));
    entries.set(email, roles);
  }
  return {
    allows: (email) => entries.has(email.toLowerCase()),
    initialRoles: (email) => entries.get(email.toLowerCase()) ?? [],
    entries: () => [...entries].map(([email, roles]) => ({ email, roles })),
  };
}
