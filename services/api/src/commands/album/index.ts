/** Album commands, registered on the one command registry at boot. */
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

export function registerAlbum(doors: { readonly registry: CommandRegistry }): void {
  registerAlbumCommands(doors.registry);
}
