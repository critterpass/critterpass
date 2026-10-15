/**
 * Add an expense before it can open (7.18): the crew and trip still loading or seeding, or no trip
 * to add it to yet.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

export function AddExpenseWaiting(props: {
  readonly closeLabel: string;
  /** Still loading, or a ready context still seeding: it waits rather than saying "no trip". */
  readonly seeding: boolean;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  return (
    <FullScreen closeLabel={props.closeLabel} overPhoto={false} testID="money-add-waiting">
      <View
        style={[styles.root, { backgroundColor: th.color.ground, paddingTop: insets.top + 80 }]}
      >
        {props.seeding ? (
          <View style={{ padding: th.space.gutter, gap: th.space.gap12 }}>
            <Skeleton height={60} radius={th.radius.card} />
            <Skeleton height={240} radius={th.radius.card} />
          </View>
        ) : (
          <EmptyState
            title={t({ id: 'money.premium.noTripTitle', message: 'No trip to add it to' })}
            line={t({
              id: 'money.premium.noTripLine',
              message: 'Expenses belong to a trip. Start one with the crew, then add it here.',
            })}
          />
        )}
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
