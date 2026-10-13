/**
 * Your share in the premium look (undesigned; a card with the number roll and toggles): the
 * member's share rolling to its new amount as savings are taken, and each saving the guide offered
 * as a toggle ("Skip the Nara day and save $64"). Every number is the cost engine's.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Card, NumberRoll, Text, Toggle, usePremiumTheme } from '@/ui/premium';

import { wholeMoney } from '../../data/format';
import { shareWith, type ShareCardProps } from '../../your-version/share-card';

export function PremiumShareCard(props: ShareCardProps) {
  const theme = usePremiumTheme();
  const { locale, currency } = props;
  const share = shareWith(props.baseMinor, props.savings, props.chosen);
  const saved = props.baseMinor - share;
  return (
    <Card testID="version-share">
      <View style={styles.stack}>
        <View style={styles.top}>
          <View style={styles.grow}>
            <Text variant="captionMuted" tone="muted">
              {t({ id: 'proposal.share.title', message: 'Your share' })}
            </Text>
            <NumberRoll
              text={wholeMoney(locale, share, currency)}
              variant="stat"
              testID="version-share-amount"
            />
          </View>
          {saved > 0 ? (
            <Text variant="rowTextStrong" color={theme.color.status.booked.text}>
              {t({
                id: 'proposal.premium.share.saved',
                message: `−${wholeMoney(locale, saved, currency)}`,
              })}
            </Text>
          ) : null}
        </View>
        {props.savings.map((saving) => {
          const on = props.chosen.includes(saving.id);
          const amount = wholeMoney(locale, Math.abs(saving.displayDeltaMinor), saving.currency);
          const label = t({
            id: 'proposal.share.skip',
            message: `Skip ${saving.label} and save ${amount}`,
          });
          return (
            <View
              key={saving.id}
              style={[
                styles.saving,
                { borderTopColor: theme.color.hairline, gap: theme.space.gap12 },
              ]}
            >
              <Text variant="rowText" style={styles.grow}>
                {label}
              </Text>
              <Toggle
                value={on}
                onChange={(next) => props.onToggle(saving.id, next)}
                accessibilityLabel={label}
                testID={`version-saving-${saving.id}`}
              />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  grow: { flex: 1 },
  saving: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
