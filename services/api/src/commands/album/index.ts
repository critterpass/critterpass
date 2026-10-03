/**
 * The album's api mount: its commands, and the hook that queues the album's curation for the
 * events this process appends (photos registered or deleted, a trip ended here), the same hook the
 * worker registers for its own.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { albumCurateForEvent } from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';
import { deletePhotoCommand } from './delete-photo';
import { registerPhotoCommand } from './register-photo';
import { requestAlbumExportCommand } from './request-album-export';
import { setAlbumAutoIngestCommand } from './set-album-auto-ingest';
import { setAlbumPickCommand } from './set-album-pick';
import { tagSelfInPhotoCommand } from './tag-self-in-photo';

export function registerAlbumCommands(registry: CommandRegistry): void {
  registry.register(registerPhotoCommand);
  registry.register(deletePhotoCommand);
  registry.register(setAlbumPickCommand);
  registry.register(tagSelfInPhotoCommand);
  registry.register(setAlbumAutoIngestCommand);
  registry.register(requestAlbumExportCommand);
}

export async function albumEventHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const request = albumCurateForEvent(event);
  if (request !== null) await sendInTx(tx, request.queue, request.data, request.options);
}

export function registerAlbum(doors: { readonly registry: CommandRegistry }): void {
  registerAlbumCommands(doors.registry);
  onEventAppended(albumEventHook);
}
