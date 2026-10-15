/** Who paid (7.18): the crew's avatars; the payer wears the ink ring, the rest stand back. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { PressableScale, ScrollRow, Text, usePremiumTheme } from '@/ui/premium';

import type { MoneyMember } from '../../data/context';
import { RingedAvatar } from './RingedAvatar';

export function PayerRow(props: {
  readonly members: readonly MoneyMember[];
  readonly payerId: string;
  readonly onPayer: (userId: string) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View style={[styles.line, { paddingHorizontal: th.space.gutter }]}>
      <Text variant="label" tone="muted" style={styles.label}>
        {t({ id: 'money.premium.paidBy', message: 'Paid by' })}
      </Text>
      {/* The payer's outset ring needs room the scroller would otherwise cut. */}
      <ScrollRow gap={th.space.gap6} contentContainerStyle={styles.ringRoom}>
        {props.members.map((member) => {
          const payer = member.userId === props.payerId;
          return (
            <PressableScale
              key={member.userId}
              onPress={() => props.onPayer(member.userId)}
              accessibilityRole="radio"
              accessibilityState={{ selected: payer }}
              accessibilityLabel={member.name}
              testID={`money-add-payer-${member.userId}`}
            >
              <RingedAvatar member={member} ringed={payer} dimmed />
            </PressableScale>
          );
        })}
      </ScrollRow>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 56 },
  // Faded the same way on a dark ground the faces went muddy: they stay readable there.
  ringRoom: { paddingHorizontal: 5 },
});
