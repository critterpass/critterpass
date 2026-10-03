/**
 * SHARE RECAP: the share sheet over the recap card drawn on the phone (story or post), with the
 * system share sheet and save to Photos.
 */
import type { DistanceUnit } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { ShareImageSheet } from '@/ui/share-image/ShareImageSheet';

import { deviceShareDeps, renderRecapCard } from './share-card';
import { headerEyebrow, headerTitle, tileCopy } from './summary-copy';
import type { SummaryModel } from './summary-model';

export interface RecapShareSheetProps {
  readonly model: SummaryModel;
  readonly guide: GuideId;
  readonly unit: DistanceUnit;
  readonly onClose: () => void;
}

export function RecapShareSheet({ model, guide, unit, onClose }: RecapShareSheetProps) {
  const locale = useLocale();
  const title = headerTitle(model).replace(/\s+/gu, ' ');
  const eyebrow = headerEyebrow(model, locale);
  return (
    <ShareImageSheet
      visible
      onClose={onClose}
      altText={`${title}, ${eyebrow}`}
      formats={['story', 'post']}
      render={(format) =>
        renderRecapCard(
          {
            guideKind: GUIDE_STICKERS[guide].kind,
            title,
            eyebrow,
            tiles: model.tiles.map((tile) => tileCopy(tile, locale, unit)),
          },
          format,
        )
      }
      deps={deviceShareDeps()}
    />
  );
}
