/**
 * The pieces of Change a day in the premium look (undesigned; built from the kit): the reason
 * chips (a pill each, filled ink once picked), the picked day's summary that flips in under the
 * days, the waiting sheet before the draft is on the phone, and the offer once every free redraft
 * is spent.
 */
import { REDRAFT_REASON_CHIPS, type RedraftReasonKey } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { goBackOr } from '@/lib/navigation/back';
import {
  Button,
  Card,
  Chip,
  Icon,
  LoadingCritter,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { clock } from '../../draft/data/format';
import type { ReviewDay } from '../../draft/data/version';
import { reasonLabel } from '../../draft/redraft/redraft-words';
import { draftLoadingLabel } from '../../draft/review/draft-copy';
import { draftRoutes } from '../../draft/routes';

export function PremiumReasonChips(props: {
  readonly selected: ReadonlySet<RedraftReasonKey>;
  readonly onToggle: (reason: RedraftReasonKey) => void;
}) {
  return (
    <View style={styles.wrap} testID="redraft-reasons">
      {REDRAFT_REASON_CHIPS.map(({ key }) => {
        const on = props.selected.has(key);
        return (
          <Chip
            key={key}
            label={reasonLabel(key)}
            selected={on}
            surface="white"
            accessibilityRole="checkbox"
            onPress={() => props.onToggle(key)}
            testID={`redraft-reason-${key}`}
          />
        );
      })}
    </View>
  );
}

export function PremiumDaySummary(props: { readonly day: ReviewDay; readonly locale: string }) {
  const { day, locale } = props;
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const n = day.dayNo;
  const title = day.title;
  const stops = day.stops
    .map((stop) => `${clock(locale, stop.startsAt, stop.tz)} ${stop.name}`)
    .join(' · ');
  const keeps = day.stops
    .filter((stop) => stop.locked)
    .map((stop) => stop.name)
    .join(', ');
  return (
    <Animated.View {...(reduced ? {} : { entering: FadeInDown.duration(260) })}>
      <Card testID="change-day-summary">
        <View style={styles.summary}>
          <Text variant="headline">
            {t({ id: 'planDraft.change.dayTitle', message: `Day ${n} · ${title}` })}
          </Text>
          <Text variant="rowText" tone="muted">
            {stops === ''
              ? t({ id: 'planDraft.change.empty', message: 'Nothing booked, on purpose' })
              : stops}
          </Text>
          {keeps === '' ? null : (
            <View style={styles.keeps}>
              <Icon name="lock" size={14} color={theme.color.muted} />
              <Text variant="caption" tone="muted">
                {t({ id: 'planDraft.change.keeps', message: `Stays put: ${keeps}` })}
              </Text>
            </View>
          )}
        </View>
      </Card>
    </Animated.View>
  );
}

/** A draft sheet before its draft is on the phone; closes onto the draft when it is gone. */
export function PremiumDraftSheetWaiting(props: {
  readonly tripId: string;
  readonly gone: boolean;
}) {
  const { tripId, gone } = props;
  useEffect(() => {
    if (gone) goBackOr(draftRoutes.review(tripId));
  }, [gone, tripId]);
  return (
    <SheetScreen
      cancelLabel={t({ id: 'plan.premium.draft.cancel', message: 'Cancel' })}
      scroll={false}
      testID="draft-sheet-waiting"
    >
      <View style={styles.waiting}>
        <LoadingCritter label={draftLoadingLabel()} />
      </View>
    </SheetScreen>
  );
}

export function PremiumBoostOffer({ onBoost }: { readonly onBoost: (() => void) | undefined }) {
  return (
    <View style={styles.boost} testID="redraft-spent">
      <Text variant="body" align="center">
        {t({ id: 'planDraft.spent.line', message: 'That’s every free redraft on this trip.' })}
      </Text>
      {onBoost === undefined ? null : (
        <Button
          variant="secondary"
          label={t({ id: 'planDraft.spent.boost', message: 'Boost for unlimited redrafts' })}
          onPress={onBoost}
          testID="redraft-boost"
        />
      )}
      <Text variant="caption" tone="muted" align="center">
        {t({ id: 'planDraft.spent.reset', message: 'Redrafts reset every trip.' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summary: { gap: 6 },
  keeps: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  boost: { gap: 8, alignItems: 'stretch' },
});
