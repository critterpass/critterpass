/**
 * The pieces of Share the plan (3o-4): the live preview, built with the same projection the
 * server publishes; the four toggles (the chat stays private); and copying a read-only link.
 */
import { buildSharedPlanProjection, type SharedPlanToggles, type TripSharedPlan } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { useCommandFeedback } from '@/motion/island-toast';
import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import { createPlanLink } from '../commands';
import { crewLine, daysLabel, planTitle } from '../copy';
import { toastIds } from '../ids';

export function Preview({ data, toggles }: { data: TripSharedPlan; toggles: SharedPlanToggles }) {
  const { t } = useLingui();
  const locale = useLocale();
  if (data.skeleton === null) return null;
  const projection = buildSharedPlanProjection(data.skeleton, toggles);
  const card = {
    id: '',
    title: null,
    destination_name: projection.destination_name,
    tags: projection.tags,
    days_count: projection.days_count,
    travel_month: projection.travel_month,
    travel_year: projection.travel_year,
    crew_size: projection.crew_size,
    crew_names: projection.crew_names,
    cost_pp_rounded_minor: projection.cost_pp_rounded_minor,
    currency: projection.currency,
    rating_avg: null,
    rating_count: 0,
    copies_count: 0,
    travelled: projection.travelled,
    match_pct: null,
  };
  return (
    <Card tone="yellow" halftone radius="cardBig" testID="share-plan-preview">
      <Stack gap="8">
        <Text variant="eyebrow">
          {t({ id: 'community.publish.preview', message: 'How other crews will see it' })}
        </Text>
        <Text variant="displayXl">{planTitle(card)}</Text>
        <Text variant="body">{crewLine(card, locale)}</Text>
        <Row gap="6" wrap>
          <InfoPill>{daysLabel(projection.days_count)}</InfoPill>
          {projection.photos.length === 0 ? null : (
            <InfoPill>
              {t({ id: 'community.publish.photos', message: `${projection.photos.length} photos` })}
            </InfoPill>
          )}
        </Row>
        {projection.travelled ? null : (
          <Text variant="caption">
            {t({ id: 'community.notTravelled', message: 'Planned, not travelled yet' })}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export function Toggles({
  toggles,
  onChange,
  photos,
}: {
  toggles: SharedPlanToggles;
  onChange: (next: SharedPlanToggles) => void;
  photos: number;
}) {
  const { t } = useLingui();
  const guide = guideSticker(null).name;
  return (
    <SettingsGroup
      title={t({ id: 'community.publish.what', message: 'What other crews see' })}
      testID="share-plan-toggles"
      rows={[
        {
          key: 'names',
          kind: 'toggle',
          value: toggles.names,
          onChange: (names) => onChange({ ...toggles, names }),
          title: t({ id: 'community.publish.names', message: 'Our names' }),
          subtitle: toggles.names
            ? t({ id: 'community.publish.namesOn', message: 'On: first names only' })
            : t({ id: 'community.publish.namesOff', message: 'Off: you show up as a crew' }),
        },
        {
          key: 'costs',
          kind: 'toggle',
          value: toggles.costs,
          onChange: (costs) => onChange({ ...toggles, costs }),
          title: t({ id: 'community.publish.costs', message: 'What it cost' }),
          subtitle: t({ id: 'community.publish.costsLine', message: 'Per person, rounded to 10' }),
        },
        {
          key: 'photos',
          kind: 'toggle',
          value: toggles.photos,
          onChange: (next) => onChange({ ...toggles, photos: next }),
          title: t({ id: 'community.publish.photosRow', message: `${photos} best photos` }),
          subtitle: t({
            id: 'community.publish.photosLine',
            message: `Picked by ${guide}, only photos without faces`,
          }),
        },
        {
          key: 'chat',
          kind: 'private',
          title: t({ id: 'community.publish.chat', message: 'The chat' }),
          subtitle: t({ id: 'community.publish.chatLine', message: 'Never leaves the crew' }),
        },
      ]}
    />
  );
}

export function useLinkCopy(tripId: string) {
  const { t } = useLingui();
  const { send } = useCommand(createPlanLink);
  const { report } = useCommandFeedback();
  return async () => {
    const result = await send({ trip_id: tripId });
    if (result.kind === 'applied') {
      await Clipboard.setStringAsync((result.result as { url: string }).url);
    }
    report(result, {
      id: toastIds.link(tripId),
      done: t({ id: 'community.publish.linkCopied', message: 'Read-only link copied.' }),
    });
  };
}
