/**
 * Retention registry for `maint.purge` (docs/api-contracts-async.md §2.3, docs/data-model.md
 * retention column). One rule per table: rows whose `column` is older than `ttlDays` (and that
 * match `where`) are deleted in batches. Features that own a table with a retention period add
 * their rule here next to the table's own migration.
 *
 * Two kinds of rule:
 * - `direct`: app_system holds SELECT and DELETE on the table; the job deletes with the rule's own
 *   `column` and `where`, both static SQL written here (never input).
 * - `function`: the table is closed to app_system (cmd_log, cmd_results, domain_events, rt_outbox);
 *   `app.purge_expired` holds the column and filter, and the rule only supplies the age.
 */
export interface DirectRetentionRule {
  readonly kind: 'direct';
  readonly table: string;
  /** Timestamp (or date) column the age is measured on. */
  readonly column: string;
  readonly ttlDays: number;
  /** Extra static predicate, e.g. "only rows that already fired". */
  readonly where?: string;
}

export interface FunctionRetentionRule {
  readonly kind: 'function';
  readonly table: string;
  readonly ttlDays: number;
}

export type RetentionRule = DirectRetentionRule | FunctionRetentionRule;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

const rules = new Map<string, RetentionRule>();

export function registerRetentionRule(rule: RetentionRule): void {
  if (rules.has(rule.table)) throw new Error(`retention rule for ${rule.table} already registered`);
  if (!IDENTIFIER.test(rule.table)) throw new Error(`invalid table name ${rule.table}`);
  if (rule.kind === 'direct' && !IDENTIFIER.test(rule.column)) {
    throw new Error(`invalid column name ${rule.column}`);
  }
  if (!(rule.ttlDays >= 1)) throw new Error(`retention for ${rule.table} must be at least a day`);
  rules.set(rule.table, rule);
}

/** Every rule, in registration order (a referencing table before the table it references). */
export function listRetentionRules(): readonly RetentionRule[] {
  return [...rules.values()];
}

// Command bookkeeping: results before the log rows they reference.
registerRetentionRule({ kind: 'function', table: 'cmd_results', ttlDays: 14 });
registerRetentionRule({ kind: 'function', table: 'cmd_log', ttlDays: 30 });
registerRetentionRule({ kind: 'function', table: 'rt_outbox', ttlDays: 7 });
registerRetentionRule({ kind: 'function', table: 'domain_events', ttlDays: 400 });

// Notification tables: a rule whose table does not exist yet is skipped until its migration lands.
registerRetentionRule({
  kind: 'direct',
  table: 'notifications',
  column: 'created_at',
  ttlDays: 90,
});
registerRetentionRule({ kind: 'direct', table: 'ping_ledger', column: 'local_date', ttlDays: 30 });
registerRetentionRule({ kind: 'direct', table: 'roundups', column: 'local_date', ttlDays: 30 });
registerRetentionRule({
  kind: 'direct',
  table: 'push_tokens',
  column: 'invalid_at',
  ttlDays: 7,
  where: 'invalid_at IS NOT NULL',
});

registerRetentionRule({
  kind: 'direct',
  table: 'scheduled_events',
  column: 'updated_at',
  ttlDays: 30,
  where: "status <> 'pending'",
});
