/**
 * The meter chip under the guide's name: "12 OF 30 TODAY" on the free meter, "UNLIMITED PON" on a
 * boosted trip, nothing with Pass+.
 */
import { useLingui } from '@lingui/react/macro';

import { upper } from '@cp/i18n';

import { Row } from '@/ui';
import { InfoPill } from '@/ui/chips/InfoPill';

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
      <InfoPill variant="outline" testID={`guide-meter-${meter.kind}`}>
        {upper(label, i18n.locale)}
      </InfoPill>
    </Row>
  );
}
