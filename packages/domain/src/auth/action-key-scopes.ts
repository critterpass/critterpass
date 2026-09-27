/**
 * Device action key scopes (docs/api-contracts-async.md §5): what a signed extension request
 * (widget, Live Activity, notification action) may do without the app's own session. A key can carry
 * more than one scope; the verification middleware (services/api/src/auth/action-keys/verify.ts)
 * rejects a request whose target scope is not in the key's own list with `ACTION_KEY_SCOPE`.
 */

export const ACTION_KEY_SCOPES = [
  'ballot',
  'readiness',
  'trip_day',
  'sos',
  'money_nudge',
  'money_mark',
  'rsvp',
  'changeset',
  'chat_reply',
  'inbox',
  'read_snapshot',
  'read_notification',
] as const;

export type ActionKeyScope = (typeof ACTION_KEY_SCOPES)[number];

export function isActionKeyScope(value: string): value is ActionKeyScope {
  return (ACTION_KEY_SCOPES as readonly string[]).includes(value);
}
