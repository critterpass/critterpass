/**
 * The pieces of Share the plan, premium: the live preview card (built with the same projection the
 * server publishes), the four switches (the chat stays private), and the two-choice alerts before
 * something other people see is taken down or a link switched off.
 */
import { buildSharedPlanProjection, type SharedPlanToggles, type TripSharedPlan } from '@cp/domain';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Card,
  Icon,
  ListCard,
  Row,
  StatusTag,
  Tag,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { crewLine, daysLabel, planTitle } from '../copy';
import type { Confirming } from '../publish/take-down';

export function PreviewPremium({
  data,
  toggles,
}: {
  readonly data: TripSharedPlan;
  readonly toggles: SharedPlanToggles;
}) {
  const th = usePremiumTheme();
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
    <Card
      padded
      radius={th.radius.cardLarge}
      style={{ gap: th.space.gap8, paddingTop: th.space.gap16 }}
      testID="share-plan-preview"
    >
      <Tag
        label={t({ id: 'community.publish.preview', message: 'How other crews will see it' })}
        color={th.accent.sky}
        rotate={-3}
      />
      <Text variant="title" style={{ marginTop: th.space.gap4 }}>
        {planTitle(card)}
      </Text>
      <Text variant="rowText" tone="muted">
        {crewLine(card, locale)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap6 }}>
        <StatusTag tone="unopened" label={daysLabel(projection.days_count)} />
        {projection.photos.length === 0 ? null : (
          <StatusTag
            tone="rain"
            label={t({
              id: 'community.publish.photos',
              message: plural(projection.photos.length, { one: '# photo', other: '# photos' }),
            })}
          />
        )}
      </View>
      {projection.travelled ? null : (
        <Text variant="caption" tone="muted">
          {t({ id: 'community.notTravelled', message: 'Planned, not travelled yet' })}
        </Text>
      )}
    </Card>
  );
}

export function TogglesPremium({
  toggles,
  onChange,
  photos,
}: {
  readonly toggles: SharedPlanToggles;
  readonly onChange: (next: SharedPlanToggles) => void;
  readonly photos: number;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = guideSticker(null).name;
  const names = t({ id: 'community.publish.names', message: 'Our names' });
  const costs = t({ id: 'community.publish.costs', message: 'What it cost' });
  const pictures = t({ id: 'community.publish.photosRow', message: `${photos} best photos` });
  return (
    <View style={{ gap: th.space.gap8 }}>
      <Text variant="headline" accessibilityRole="header">
        {t({ id: 'community.publish.what', message: 'What other crews see' })}
      </Text>
      <ListCard testID="share-plan-toggles">
        <Row
          title={names}
          subtitle={
            toggles.names
              ? t({ id: 'community.publish.namesOn', message: 'On: first names only' })
              : t({ id: 'community.publish.namesOff', message: 'Off: you show up as a crew' })
          }
          trailing={
            <Toggle
              value={toggles.names}
              onChange={(next) => onChange({ ...toggles, names: next })}
              accessibilityLabel={names}
              testID="share-plan-toggle-names"
            />
          }
        />
        <Row
          title={costs}
          subtitle={t({ id: 'community.publish.costsLine', message: 'Per person, rounded to 10' })}
          trailing={
            <Toggle
              value={toggles.costs}
              onChange={(next) => onChange({ ...toggles, costs: next })}
              accessibilityLabel={costs}
              testID="share-plan-toggle-costs"
            />
          }
        />
        <Row
          title={pictures}
          subtitle={t({
            id: 'community.publish.photosLine',
            message: `Picked by ${guide}, only photos without faces`,
          })}
          trailing={
            <Toggle
              value={toggles.photos}
              onChange={(next) => onChange({ ...toggles, photos: next })}
              accessibilityLabel={pictures}
              testID="share-plan-toggle-photos"
            />
          }
        />
        <Row
          title={t({ id: 'community.publish.chat', message: 'The chat' })}
          subtitle={t({ id: 'community.publish.chatLine', message: 'Never leaves the crew' })}
          trailing={<Icon name="lock" size={18} color={th.color.muted} />}
        />
      </ListCard>
    </View>
  );
}

/** Asks before a take-down or a link switch-off; resolves true when the person chose to go on. */
export function useConfirmTakeDown(): (confirming: Confirming) => Promise<boolean> {
  const { t } = useLingui();
  return (confirming) => {
    const cancel = t({ id: 'common.cancel', message: 'Cancel' });
    if (confirming.kind === 'revoke') {
      const made = confirming.made;
      return confirmAlert({
        title: t({ id: 'community.revoke.title', message: `Turn off the link made ${made}?` }),
        message: t({
          id: 'community.revoke.line',
          message: 'Anyone who has it sees "no longer shared". You can make a new link any time.',
        }),
        confirm: t({ id: 'community.revoke.confirm', message: 'Turn it off' }),
        cancel,
      });
    }
    const mine = confirming.kind === 'withdraw';
    return confirmAlert({
      title: mine
        ? t({ id: 'community.withdraw.title', message: 'Take your yes back?' })
        : t({ id: 'community.unpublish.title', message: 'Unpublish this plan?' }),
      message: t({
        id: 'community.unpublish.line',
        message: 'The plan comes down from crew plans, with its saves and rating.',
      }),
      confirm: mine
        ? t({ id: 'community.withdraw.confirm', message: 'Take it down' })
        : t({ id: 'community.published.unpublish', message: 'Unpublish' }),
      cancel,
    });
  };
}
