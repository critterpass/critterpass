/**
 * "Download my data" as the Settings row shows it, from the newest synced `data_exports` row: none
 * asked yet, on its way (with progress), ready until a date, expired, or failed. Asking again is
 * open unless one is on its way or one was asked for in the last day (a failed one does not count).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { EXPORT_COOLDOWN_HOURS } from '@cp/domain';

export const LATEST_EXPORT_SQL = `SELECT id, status, progress, requested_at, expires_at
  FROM data_exports WHERE user_id = ? ORDER BY requested_at DESC LIMIT 2`;
export const LATEST_EXPORT_TABLES = ['data_exports'];

export interface ExportRow {
  readonly id: string;
  readonly status: string;
  readonly progress: number | null;
  readonly requested_at: string;
  readonly expires_at: string | null;
}

export type ExportState =
  | { readonly kind: 'none' }
  | { readonly kind: 'building'; readonly progress: number }
  | { readonly kind: 'ready'; readonly id: string; readonly expiresAt: string }
  | { readonly kind: 'expired'; readonly askAgainAt: string | null }
  | { readonly kind: 'failed' };

function askAgainAt(rows: readonly ExportRow[], now: Date): string | null {
  const last = rows.find((row) => row.status !== 'failed');
  if (last === undefined) return null;
  const until = new Date(Date.parse(last.requested_at) + EXPORT_COOLDOWN_HOURS * 3_600_000);
  return until.getTime() > now.getTime() ? until.toISOString() : null;
}

export function exportStateOf(rows: readonly ExportRow[], now: Date): ExportState {
  const latest = rows[0];
  if (latest === undefined) return { kind: 'none' };
  switch (latest.status) {
    case 'queued':
    case 'building':
      return { kind: 'building', progress: Math.max(0, Math.min(100, latest.progress ?? 0)) };
    case 'ready':
      if (latest.expires_at !== null && Date.parse(latest.expires_at) > now.getTime()) {
        return { kind: 'ready', id: latest.id, expiresAt: latest.expires_at };
      }
      return { kind: 'expired', askAgainAt: askAgainAt(rows, now) };
    case 'expired':
      return { kind: 'expired', askAgainAt: askAgainAt(rows, now) };
    default:
      return { kind: 'failed' };
  }
}
