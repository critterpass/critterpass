/**
 * Reports on a driver's listing or on a crew's tip reach the moderation queue through
 * `report_content` (kinds `driver_listing`, `driver_tip`). Hiding a listing takes it down at once
 * (status `removed`, so the same number cannot quietly list again); hiding a tip removes it from
 * the listing. Every verdict is audited by the moderation pipeline.
 */
import { registerModerationKind } from '../../admin/moderation-intake';

export const DRIVER_LISTING_MODERATION_KIND = 'driver_listing';
export const DRIVER_TIP_MODERATION_KIND = 'driver_tip';

registerModerationKind({
  kind: DRIVER_LISTING_MODERATION_KIND,
  verdicts: ['approve', 'hide', 'remove'],
  exists: async (tx, id) =>
    (await tx.query("SELECT 1 FROM driver_listings WHERE id = $1 AND status = 'listed'", [id]))
      .rowCount === 1,
  preview: async (tx, id) => {
    const { rows } = await tx.query<{
      display_name: string;
      areas: string[];
      price_text: string | null;
    }>('SELECT display_name, areas, price_text FROM driver_listings WHERE id = $1', [id]);
    const listing = rows[0];
    if (listing === undefined) return { type: 'missing', title: 'Driver listing' };
    return {
      type: 'text',
      title: `Driver listing: ${listing.display_name}`,
      text: `${listing.areas.join(', ')} · ${listing.price_text ?? 'no price text'}`,
    };
  },
  // The driver has no account: there is nobody to ban.
  author: () => Promise.resolve(null),
  apply: async (tx, id) => {
    await tx.query("UPDATE driver_listings SET status = 'removed' WHERE id = $1", [id]);
  },
});

registerModerationKind({
  kind: DRIVER_TIP_MODERATION_KIND,
  verdicts: ['approve', 'hide', 'remove', 'ban_author'],
  exists: async (tx, id) =>
    (
      await tx.query("SELECT 1 FROM driver_tips WHERE id = $1 AND status IN ('visible', 'held')", [
        id,
      ])
    ).rowCount === 1,
  preview: async (tx, id) => {
    const { rows } = await tx.query<{ text: string; crew_size: number; month: string }>(
      'SELECT text, crew_size, month::text FROM driver_tips WHERE id = $1',
      [id],
    );
    const tip = rows[0];
    if (tip === undefined) return { type: 'missing', title: 'Driver tip' };
    return {
      type: 'text',
      title: `Driver tip · crew of ${tip.crew_size} · ${tip.month.slice(0, 7)}`,
      text: tip.text,
    };
  },
  author: async (tx, id) => {
    const { rows } = await tx.query<{ author_id: string | null }>(
      'SELECT author_id FROM driver_tips WHERE id = $1',
      [id],
    );
    return rows[0]?.author_id ?? null;
  },
  apply: async (tx, id) => {
    await tx.query("UPDATE driver_tips SET status = 'removed' WHERE id = $1", [id]);
  },
  // A tip the automated check held goes on the listing once ops approve it.
  approve: async (tx, id) => {
    await tx.query("UPDATE driver_tips SET status = 'visible' WHERE id = $1 AND status = 'held'", [
      id,
    ]);
  },
});
