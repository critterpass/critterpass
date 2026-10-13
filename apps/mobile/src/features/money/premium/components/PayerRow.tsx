/** Who paid (7.18): the crew's avatars; the payer wears the ink ring, the rest stand back. */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { Avatar, PressableScale, ring, Text, usePremiumTheme } from '@/ui/premium';

import type { MoneyMember } from '../../data/context';

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: th.space.gap6 }}
      >
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
              <View
                style={[
                  styles.payer,
                  payer
                    ? {
                        boxShadow: [ring(2.5, th.color.ground), ring(4.5, th.color.ink)].join(', '),
                      }
                    : styles.dim,
                ]}
              >
                <Avatar
                  name={member.name}
                  color={crewAccent(member.joinIndex)}
                  uid={member.userId}
                  size={36}
                />
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 56 },
  payer: { borderRadius: 18 },
  dim: { opacity: 0.45 },
});
