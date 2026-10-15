/**
 * 7.01: no bookings yet. Three tilted cards with an empty "Your first booking" slot in front, the
 * promise that bookings open with no signal, and the ways to fill the wallet.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { IconTile, turn } from '@/features/trip';
import { Button, Icon, ListCard, Row, Text, usePremiumTheme } from '@/ui/premium';

export interface EmptyBookingsProps {
  readonly address: string | null;
  readonly onForward: () => void;
  readonly onScan: () => void;
  readonly onByHand: () => void;
  readonly onMailbox: () => void;
}

function HeroStack() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const back = {
    position: 'absolute' as const,
    height: 150,
    borderRadius: th.radius.card,
    opacity: 0.85,
  };
  return (
    <View
      style={{ height: 230, marginHorizontal: 40, marginTop: th.space.gap16 }}
      accessible={false}
    >
      <View
        style={[
          back,
          {
            left: 0,
            right: 16,
            top: 0,
            backgroundColor: th.accent.sun,
            transform: [turn(-8)],
          },
        ]}
      />
      <View
        style={[
          back,
          {
            left: 8,
            right: 8,
            top: 18,
            backgroundColor: th.accent.pink,
            transform: [turn(4)],
          },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 0,
          top: 36,
          height: 150,
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: th.color.outlineEmpty,
          boxShadow: th.shadow.raised,
          transform: [turn(-2)],
          alignItems: 'center',
          justifyContent: 'center',
          gap: th.space.gap8,
        }}
      >
        <Icon name="plus" size={26} color={th.color.placeholder} />
        <Text variant="label" tone="muted">
          {t({ id: 'bookings.premium.firstBooking', message: 'Your first booking' })}
        </Text>
      </View>
    </View>
  );
}

export function EmptyBookings(props: EmptyBookingsProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View testID="bookings-empty" style={{ gap: th.space.gap16 }}>
      <HeroStack />
      <View style={{ paddingHorizontal: 28, gap: th.space.gap6 }}>
        <Text variant="title" align="center">
          {t({ id: 'bookings.premium.emptyTitle', message: 'Flights, stays, tickets' })}
        </Text>
        <Text variant="emptyLine" tone="muted" align="center">
          {t({
            id: 'bookings.premium.emptyLine',
            message: 'Everything saves to this phone, so it opens with no signal at the gate.',
          })}
        </Text>
      </View>
      <ListCard radius={th.radius.cardRow} style={{ marginHorizontal: th.space.gap16 }}>
        <Row
          title={t({ id: 'bookings.premium.forwardEmail', message: 'Forward the email' })}
          {...(props.address === null
            ? {}
            : { subtitle: props.address, subtitleCut: 'middle' as const })}
          leading={
            <IconTile name="link" bg={th.color.status.rain.bg} color={th.color.status.rain.text} />
          }
          trailing={
            <Button
              label={t({ id: 'bookings.add.copy', message: 'Copy' })}
              variant="control"
              size="small"
              onPress={props.onForward}
              testID="bookings-empty-copy"
            />
          }
          onPress={props.onForward}
          testID="bookings-channel-forward"
        />
        <Row
          title={t({ id: 'bookings.premium.scanTicket', message: 'Scan a ticket or screenshot' })}
          leading={
            <IconTile
              name="scan"
              bg={th.color.status.maybe.bg}
              color={th.color.status.maybe.text}
            />
          }
          trailing={<Icon name="forward" size={14} color={th.color.outlineEmpty} />}
          onPress={props.onScan}
          testID="bookings-channel-scan"
        />
        <Row
          title={t({ id: 'bookings.premium.byHand', message: 'Add by hand' })}
          leading={<IconTile name="edit" bg={th.color.control} color={th.color.ink} />}
          trailing={<Icon name="forward" size={14} color={th.color.outlineEmpty} />}
          onPress={props.onByHand}
          testID="bookings-channel-hand"
        />
        <Row
          title={t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' })}
          leading={
            <IconTile
              name="mail"
              bg={th.color.status.booked.bg}
              color={th.color.status.booked.text}
            />
          }
          trailing={<Icon name="forward" size={14} color={th.color.outlineEmpty} />}
          onPress={props.onMailbox}
          testID="bookings-channel-mailbox"
        />
      </ListCard>
    </View>
  );
}
