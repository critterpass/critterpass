/**
 * The `photo` moderation subject (docs/api-contracts.md §4.17): a traveller reports an album photo
 * from the viewer. Only someone who can see the photo (a member of its trip) can report it; anyone
 * else gets `NOT_FOUND`, so nothing about the photo leaks. Hiding or removing it takes it out of
 * the album for everyone (the photo is soft-deleted; its media goes with the album's purge).
 */
import { registerModerationKind } from '../../admin/moderation-intake';

export const PHOTO_MODERATION_KIND = 'photo';

registerModerationKind({
  kind: PHOTO_MODERATION_KIND,
  verdicts: ['approve', 'hide', 'remove', 'ban_author'],
  // Runs in the reporter's transaction: `app.uid()` is still the reporter.
  exists: async (tx, id) =>
    (
      await tx.query(
        'SELECT 1 FROM photos WHERE id = $1 AND deleted_at IS NULL AND app.is_trip_member(trip_id)',
        [id],
      )
    ).rowCount === 1,
  preview: async (tx, id, media) => {
    const { rows } = await tx.query<{ display_key: string | null; media_key: string }>(
      'SELECT display_key, media_key FROM photos WHERE id = $1',
      [id],
    );
    const photo = rows[0];
    if (photo === undefined) return { type: 'missing', title: 'Album photo' };
    return {
      type: 'image',
      title: 'Album photo',
      url: await media(photo.display_key ?? photo.media_key),
    };
  },
  author: async (tx, id) => {
    const { rows } = await tx.query<{ uploader_id: string }>(
      'SELECT uploader_id FROM photos WHERE id = $1',
      [id],
    );
    return rows[0]?.uploader_id ?? null;
  },
  apply: async (tx, id) => {
    await tx.query('UPDATE photos SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [
      id,
    ]);
  },
});
