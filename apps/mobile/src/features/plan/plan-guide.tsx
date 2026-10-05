/**
 * The guide of the trip a planning screen is open on, for the screens that draw the guide or speak
 * of it by name (the plan check and its fixers, Ideas, placing, the review, Add to plan). The trip
 * is the one in the route; its guide is the synced `trips.guide_id` row. Outside a trip's route
 * (the lab, a test) it is the default guide.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { Pose } from '@cp/critter-art';
import { useGlobalSearchParams } from 'expo-router';
import { useContext, useEffect, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useGuideRowsRevision } from '@/lib/navigation/active-guide';
import { guideSticker, type GuideStickerInfo } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

const GUIDE_SQL = `SELECT g.slug FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = ?`;

/** The default guide, for lab scenes and fixtures that stand outside any trip. */
export const NO_TRIP_GUIDE: GuideStickerInfo = guideSticker(null);

export function usePlanGuide(): GuideStickerInfo {
  const { tripId } = useGlobalSearchParams<{ tripId?: string }>();
  const db = useContext(LocalFirstContext)?.db ?? null;
  const [read, setRead] = useState<{ readonly tripId: string; readonly slug: string | null }>();
  useEffect(() => {
    if (db === null || tripId === undefined || tripId === '') return undefined;
    const controller = new AbortController();
    const load = () =>
      db.getAll<{ slug: string | null }>(GUIDE_SQL, [tripId]).then(
        (rows) => {
          if (!controller.signal.aborted) setRead({ tripId, slug: rows[0]?.slug ?? null });
        },
        () => undefined,
      );
    void load();
    db.onChange(
      { onChange: () => void load() },
      { tables: ['trips', 'guides'], throttleMs: 200, signal: controller.signal },
    );
    return () => controller.abort();
  }, [db, tripId]);
  useGuideRowsRevision();
  return guideSticker(read !== undefined && read.tripId === tripId ? read.slug : null);
}

/** The trip's guide as a sticker. */
export function PlanGuideSticker({ size, pose }: { readonly size: number; readonly pose?: Pose }) {
  const guide = usePlanGuide();
  return (
    <Sticker
      kind={guide.kind}
      name={guide.name}
      seed={guide.seed}
      size={size}
      {...(pose === undefined ? {} : { pose })}
    />
  );
}
