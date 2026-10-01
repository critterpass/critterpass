/**
 * The statements one account purge runs, in order, inside one transaction as the system role.
 * Every statement takes the user id as `$1` and is safe to run again: a purge that is retried, or
 * run for an account already purged, changes nothing.
 *
 * Order: rows that hang off the user's own rows first (they carry no user column of their own),
 * then every rule in `PURGE_RULES`, the join codes and invites the user handed out, what the crew
 * is owed back in the ledger, the profile itself, the sign-in identity, and last the deletion
 * record.
 */
import { PURGE_RULES, type PurgeRule } from './purge-policy';

export interface PurgeStatement {
  /** What the statement touches, for logs and test failures. */
  readonly label: string;
  /** `$1` is the user id. */
  readonly sql: string;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoted(table: string): string {
  const [schema, name] = table.split('.');
  if (schema === undefined || name === undefined) throw new Error(`purge: bad table ${table}`);
  if (!IDENTIFIER.test(schema) || !IDENTIFIER.test(name)) {
    throw new Error(`purge: bad table ${table}`);
  }
  return `${schema}."${name}"`;
}

function column(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`purge: bad column ${name}`);
  return `"${name}"`;
}

/** The statement for one rule, or `null` for a rule that leaves its rows alone. */
export function ruleStatement(rule: PurgeRule): PurgeStatement | null {
  const table = quoted(rule.table);
  const col = column(rule.column);
  const label = `${rule.table}.${rule.column}`;
  switch (rule.action.kind) {
    case 'delete':
      return { label, sql: `DELETE FROM ${table} WHERE ${col} = $1` };
    case 'null':
      return { label, sql: `UPDATE ${table} SET ${col} = NULL WHERE ${col} = $1` };
    case 'tombstone':
      return {
        label,
        sql: `UPDATE ${table}
                 SET body = '', attachments = '[]'::jsonb, mentions = '{}',
                     deleted_at = coalesce(deleted_at, now())
               WHERE ${col} = $1 AND (deleted_at IS NULL OR body <> '')`,
      };
    case 'former_member':
      return {
        label,
        sql: `UPDATE ${table} SET status = 'former', left_at = coalesce(left_at, now())
               WHERE ${col} = $1 AND status <> 'former'`,
      };
    case 'via': {
      if (!IDENTIFIER.test(rule.action.fn))
        throw new Error(`purge: bad function ${rule.action.fn}`);
      return { label, sql: `SELECT app.${rule.action.fn}($1)` };
    }
    case 'keep':
      return null;
  }
}

/** Rows that belong to the user's rows but name no user themselves. */
const DEPENDANTS: readonly PurgeStatement[] = [
  {
    label: 'public.users.avatar_id',
    sql: 'UPDATE public.users SET avatar_id = NULL WHERE id = $1 AND avatar_id IS NOT NULL',
  },
  {
    label: "public.guide_messages (the guide's side of the user's threads)",
    sql: `DELETE FROM public.guide_messages
           WHERE thread_id IN (SELECT id FROM public.guide_threads WHERE user_id = $1)`,
  },
  {
    label: 'public.push_tokens',
    sql: `DELETE FROM public.push_tokens
           WHERE device_id IN (SELECT id FROM public.devices WHERE user_id = $1)`,
  },
];

/**
 * What crewmates still owe the leaving user is written off, pair by pair, per crew and currency:
 * one adjustment in the other direction, so every balance still sums to zero and nobody is left
 * owing someone who cannot be paid. What the user owes stays on the crew's balances.
 */
const WRITE_OFF: PurgeStatement = {
  label: 'public.ledger_entries (written off)',
  sql: `INSERT INTO public.ledger_entries
          (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency, source_kind, source_id)
        SELECT crew_id, NULL, $1, other_id, owed::bigint, currency, 'adjustment', uuidv7()
          FROM (
            SELECT crew_id, currency,
                   CASE WHEN debtor_id = $1 THEN creditor_id ELSE debtor_id END AS other_id,
                   sum(CASE WHEN creditor_id = $1 THEN amount_minor ELSE -amount_minor END) AS owed
              FROM public.ledger_entries
             WHERE (debtor_id = $1 OR creditor_id = $1) AND debtor_id <> creditor_id
             GROUP BY 1, 2, 3
          ) pairs
         WHERE owed > 0`,
};

/** Ways into a crew that the leaving user handed out stop working; the rows stay as history. */
const INVITATIONS: readonly PurgeStatement[] = [
  {
    label: 'public.join_codes (revoked)',
    sql: `UPDATE public.join_codes SET status = 'revoked' WHERE created_by = $1 AND status = 'active'`,
  },
  {
    label: 'public.invites (revoked)',
    sql: `UPDATE public.invites SET status = 'revoked'
           WHERE inviter_id = $1 AND status IN ('pending', 'later', 'waitlisted')`,
  },
];

const PROFILE: PurgeStatement = {
  label: 'public.users',
  sql: `UPDATE public.users
           SET status = 'purged', display_name = NULL, username = NULL, home_airport = NULL,
               home_country = NULL, home_currency = NULL, locale = NULL, tz = NULL,
               avatar_id = NULL, app_icon = NULL, purge_at = NULL, languages = '{}',
               username_changed_at = NULL
         WHERE id = $1`,
};

const IDENTITY: PurgeStatement = {
  label: 'auth (user, sessions, linked accounts, verifications)',
  sql: 'SELECT app.purge_account_auth($1)',
};

const RECORD: PurgeStatement = {
  label: 'public.account_deletions',
  sql: `UPDATE public.account_deletions SET purged_at = now(), balances_snapshot = NULL
         WHERE user_id = $1 AND restored_at IS NULL AND purged_at IS NULL`,
};

export function purgeStatements(): readonly PurgeStatement[] {
  const ruled = PURGE_RULES.flatMap((rule) => {
    const statement = ruleStatement(rule);
    return statement === null ? [] : [statement];
  });
  return [...DEPENDANTS, ...ruled, ...INVITATIONS, WRITE_OFF, PROFILE, IDENTITY, RECORD];
}
