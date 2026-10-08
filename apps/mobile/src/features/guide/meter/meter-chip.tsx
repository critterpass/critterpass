/**
 * The meter tag under the guide's name: "12 OF 30 TODAY" on the free meter, "UNLIMITED PON" in the
 * boost colour on a boosted trip, nothing with Pass+. A filled tag, because the sheet is a raised
 * surface and a ring in the raised colour does not show on it.
 */
import { useLingui } from '@lingui/react/macro';

import { upper } from '@cp/i18n';

import { Row } from '@/ui';
import { Tag } from '@/ui/chips/Tag';

import type { GuideMeter } from './meter-model';

export function MeterChip({
  meter,
  guideName,
}: {
  readonly meter: GuideMeter;
  readonly guideName: string;
}) {
  const { t, i18n } = useLingui();
  if (meter.kind === 'unlimited') return null;
  const label =
    meter.kind === 'boosted'
      ? t({ id: 'guide.meter.unlimited', message: `Unlimited ${guideName}` })
      : t({ id: 'guide.meter.count', message: `${meter.used} of ${meter.limit} today` });
  return (
    <Row>
      <Tag
        label={upper(label, i18n.locale)}
        tone={meter.kind === 'boosted' ? 'boost' : 'neutral'}
        size="sm"
        testID={`guide-meter-${meter.kind}`}
      />
    </Row>
  );
}
