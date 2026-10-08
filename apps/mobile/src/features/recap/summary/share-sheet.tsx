/**
 * SHARE RECAP: the shared share sheet over the recap's own card (the page's title, dates and
 * tiles), story first, with the recap's extra rows (a link to share) under the two actions.
 */
import type { DistanceUnit } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { ShareSheet, type ShareFormat } from '@/ui/share-image/ShareSheet';

import { deviceShareDeps, renderRecapCard } from './share-card';
import { headerEyebrow, headerTitle, tileCopy } from './summary-copy';
import type { SummaryModel } from './summary-model';

export interface RecapShareSheetProps {
  readonly model: SummaryModel;
  readonly guide: GuideId;
  readonly unit: DistanceUnit;
  readonly onClose: () => void;
  readonly moreActions?: ReactNode;
}

export function RecapShareSheet({
  model,
  guide,
  unit,
  onClose,
  moreActions,
}: RecapShareSheetProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const lines = useMemo(() => headerTitle(model).split('\n'), [model]);
  const eyebrow = headerEyebrow(model, locale);
  const render = useMemo(() => {
    const card = {
      guideKind: guideSticker(guide).kind,
      title: lines,
      eyebrow,
      tiles: model.tiles.map((tile) => tileCopy(tile, locale, unit)),
    };
    return (format: ShareFormat) => renderRecapCard(card, format);
  }, [guide, lines, eyebrow, model.tiles, locale, unit]);
  const deps = useMemo(() => deviceShareDeps(), []);
  return (
    <ShareSheet
      title={t({ id: 'recap.share.title', message: 'Share the recap' })}
      altText={`${lines.join(' ')}, ${eyebrow}`}
      render={render}
      deps={deps}
      testID="recap-share"
      onClose={onClose}
      moreActions={moreActions}
    />
  );
}
