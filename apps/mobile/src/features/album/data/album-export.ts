/**
 * "Download all" as the album shows it, from the traveller's synced export row: the server zips the
 * originals in the background, so asking is only the start. The link says "Zipping…" until the row
 * has its file, then offers the download until the zip expires (7 days), and says so when the zip
 * could not be made.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useLiveRows } from '@/data/powersync/live-rows';

export type AlbumExportState = 'idle' | 'asking' | 'zipping' | 'ready' | 'failed';

export interface AlbumExportRow {
  readonly id: string;
  /** `queued`, `ready`, `failed` or `expired`. */
  readonly status: string;
  readonly media_key: string | null;
  readonly expires_at: string | null;
}

export interface AlbumExportInput {
  /** The traveller's latest export for the trip, when one has synced. */
  readonly row: AlbumExportRow | null;
  /** The request is on its way to the server. */
  readonly asking: boolean;
  /** The export this screen asked for, until its row arrives. */
  readonly requestedId: string | null;
  /** The last request was refused. */
  readonly refused: boolean;
}

export function albumExportState(input: AlbumExportInput, now: number): AlbumExportState {
  const { row, asking, requestedId, refused } = input;
  if (asking) return 'asking';
  // Asked for and accepted, but its row has not synced yet: an older row does not speak for it.
  if (requestedId !== null && row?.id !== requestedId) return 'zipping';
  if (row === null) return refused ? 'failed' : 'idle';
  if (row.status === 'queued') return 'zipping';
  if (row.status === 'failed') return 'failed';
  if (row.status === 'ready' && row.media_key !== null) {
    const until = row.expires_at === null ? Number.NaN : Date.parse(row.expires_at);
    if (Number.isNaN(until) || until > now) return refused ? 'failed' : 'ready';
  }
  return refused ? 'failed' : 'idle';
}

const EXPORT_SQL = `
  SELECT id, status, media_key, expires_at FROM album_exports
   WHERE trip_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`;
const TABLES = ['album_exports'] as const;

export function useAlbumExportRow(tripId: string, me: string | null): AlbumExportRow | null {
  return (
    useLiveRows<AlbumExportRow>(EXPORT_SQL, me === null ? null : [tripId, me], TABLES).rows[0] ??
    null
  );
}
