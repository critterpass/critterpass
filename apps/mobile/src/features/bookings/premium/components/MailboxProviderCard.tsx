/**
 * One mailbox provider on the mailbox sheet (7.05): the letter tile, its name and a line under it.
 * Connected, it wears the mint ring and the check; not offered yet, it fades to 60% and points at
 * forwarding instead; otherwise the trailing slot holds its action (Connect, or the Pass+ badge).
 */
import type { MailboxProvider } from '@cp/domain';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, ring, usePremiumTheme } from '@/ui/premium';

export function MailboxProviderCard(props: {
  readonly provider: MailboxProvider;
  readonly title: string;
  readonly sub: string;
  readonly state: 'connected' | 'offered' | 'soon';
  readonly trailing?: ReactNode;
  readonly onPress?: (() => void) | undefined;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const gmail = props.provider === 'gmail';
  const card = (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: props.state === 'connected' ? ring(2, th.accent.mint) : th.shadow.card,
          opacity: props.state === 'soon' ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.tile,
          gmail
            ? { backgroundColor: th.color.card, boxShadow: ring(1.5, th.color.fieldBorder) }
            : { backgroundColor: th.color.status.rain.bg },
        ]}
      >
        <Text
          variant="stampCode"
          color={gmail ? th.color.destructive.text : th.color.status.rain.text}
          singleLine
        >
          {gmail ? 'G' : 'O'}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text variant="rowTitle" numberOfLines={1}>
          {props.title}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={2}>
          {props.sub}
        </Text>
      </View>
      {props.state === 'connected' ? (
        <View style={[styles.check, { backgroundColor: th.accent.mint }]}>
          <Icon name="check" size={12} color={th.color.onAccent} />
        </View>
      ) : (
        (props.trailing ?? null)
      )}
    </View>
  );
  if (props.onPress === undefined || props.state === 'soon') {
    return <View testID={props.testID}>{card}</View>;
  }
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      testID={props.testID}
    >
      {card}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
