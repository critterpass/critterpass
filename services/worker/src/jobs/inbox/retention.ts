/**
 * Retention for the inbox and Home's own rows (docs/data-model.md §3.9, §3.11): settled or expired
 * inbox items, fired or cancelled reminders and lapsed tips after 30 days; nudges after 90.
 */
import { registerRetentionRule } from '../maint/retention-rules';

let registered = false;

export function registerHomeRetention(): void {
  if (registered) return;
  registered = true;
  registerRetentionRule({
    kind: 'direct',
    table: 'inbox_items',
    column: 'updated_at',
    ttlDays: 30,
    where: 'resolved_at IS NOT NULL OR expires_at < now()',
  });
  registerRetentionRule({
    kind: 'direct',
    table: 'reminders',
    column: 'updated_at',
    ttlDays: 30,
    where: "status <> 'pending'",
  });
  registerRetentionRule({ kind: 'direct', table: 'home_tips', column: 'valid_until', ttlDays: 30 });
  registerRetentionRule({ kind: 'direct', table: 'nudges', column: 'created_at', ttlDays: 90 });
}
