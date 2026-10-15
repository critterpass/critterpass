/**
 * The mailbox sheet's parts (7.05): the "With Pass+" badge under its actions, and the forward
 * address row to copy.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { IconTile } from '@/features/trip';
import {
  Button,
  ListCard,
  PressableScale,
  Row,
  Text,
  usePremiumTheme,
  type PremiumTheme,
} from '@/ui/premium';

export function MailboxPassBadge(props: {
  readonly th: PremiumTheme;
  readonly onPress: (() => void) | null;
}) {
  const { t } = useLingui();
  const label = t({ id: 'bookings.mailboxRow.locked', message: 'With Pass+' });
  const badge = (
    <View style={[styles.badge, { backgroundColor: props.th.accent.sun }]}>
      <Text variant="tier" color={props.th.color.onAccent}>
        {label}
      </Text>
    </View>
  );
  if (props.onPress === null) return badge;
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'bookings.mailbox.seePass', message: 'See Pass+' })}
      testID="bookings-mailbox-see-pass"
    >
      {badge}
    </PressableScale>
  );
}

/**
 * The forward address while no mailbox can be connected yet: the wallet's "Forward the email" row,
 * the address cut in the middle under it (the crew's name and the domain stay readable) and Copy.
 */
export function MailboxAddressPill(props: {
  readonly address: string;
  readonly onCopy: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <ListCard radius={th.radius.cardRow}>
      <Row
        title={t({ id: 'bookings.premium.forwardEmail', message: 'Forward the email' })}
        subtitle={props.address}
        subtitleCut="middle"
        leading={
          <IconTile name="link" bg={th.color.status.rain.bg} color={th.color.status.rain.text} />
        }
        trailing={
          <Button
            label={t({ id: 'bookings.add.copy', message: 'Copy' })}
            variant="control"
            size="small"
            onPress={props.onCopy}
            testID="bookings-mailbox-copy"
          />
        }
        onPress={props.onCopy}
        testID="bookings-mailbox-address"
      />
    </ListCard>
  );
}

const styles = StyleSheet.create({
  badge: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
});
