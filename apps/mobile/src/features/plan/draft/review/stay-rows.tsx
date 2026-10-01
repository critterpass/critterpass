/**
 * Where the crew sleeps in this draft: nights, the kind of stay and a per-person nightly estimate
 * from our cost bands (always marked as an estimate; nothing is held). Free cancellation shows only
 * for a stay the crew imported a booking for. Undesigned: built from the draft's card and rows.
 */
import type { StayRow } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { estimateMoney, shortDate } from '../data/format';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
    gap: th.space['10'],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  grow: { flex: 1, gap: th.space['2'] },
}));

export function StayRows({
  stays,
  locale,
}: {
  readonly stays: readonly StayRow[];
  readonly locale: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (stays.length === 0) return null;
  return (
    <View style={styles.card} testID="draft-stays">
      {stays.map((stay) => {
        const nights = stay.nights;
        const kind = stay.stay_type.replaceAll('_', ' ');
        const price = estimateMoney(locale, stay.nightly_pp_minor, stay.currency);
        const until =
          stay.free_cancel_until === null ? null : shortDate(locale, stay.free_cancel_until);
        return (
          <View key={stay.stable_id} style={styles.row}>
            <Icon name="bed" size={22} decorative />
            <View style={styles.grow}>
              <Text variant="bodySm">
                {t({
                  id: 'planDraft.stay.line',
                  message: plural(nights, {
                    one: `One night · ${kind} · about ${price} a night each`,
                    other: `# nights · ${kind} · about ${price} a night each`,
                  }),
                })}
              </Text>
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {until === null
                  ? t({ id: 'planDraft.stay.estimate', message: 'Estimate. Nothing is held yet.' })
                  : t({
                      id: 'planDraft.stay.freeCancel',
                      message: `Your booking: free cancellation until ${until}`,
                    })}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
