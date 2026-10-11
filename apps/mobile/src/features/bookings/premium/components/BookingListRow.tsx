import { View } from 'react-native';

import { IconTile, LineIcon } from '@/features/trip';
import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { WalletBooking } from '../../data/model';
import { kindLook } from './kind-look';

/**
 * One booking on the wallet (1.06 rows): a 68-high white card, the kind's tile, title and when,
 * and a chevron; it opens the booking.
 */
export function BookingListRow({
  booking,
  meta,
  onOpen,
  offline,
}: {
  readonly booking: WalletBooking;
  readonly meta: string;
  readonly onOpen: () => void;
  /** Saved on this phone: opens with no signal. */
  readonly offline?: boolean;
}) {
  const t = usePremiumTheme();
  const look = kindLook(booking.kind, t.color);
  const sub = [meta, booking.location ?? ''].filter((part) => part !== '').join(' · ');
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${booking.title}, ${sub}`}
      testID={`bookings-row-${booking.id}`}
    >
      <View
        style={{
          minHeight: 68,
          borderRadius: t.radius.card,
          backgroundColor: t.color.card,
          boxShadow: t.shadow.card,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space.gap12,
          paddingStart: t.space.rowPadLeadBadge,
          paddingEnd: t.space.rowPadH,
          paddingVertical: t.space.gap10,
        }}
      >
        <IconTile name={look.icon} bg={look.bg} color={look.color} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {booking.title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {offline === true ? (
          <LineIcon name="download" size={16} color={t.color.status.booked.text} />
        ) : null}
        <Icon name="forward" size={14} color={t.color.outlineEmpty} />
      </View>
    </PressableScale>
  );
}
