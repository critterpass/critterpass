/**
 * The next booking on top of the wallet (1.06 "Next up"): the one dark card per screen, eyebrow
 * with when, the title, where, and for a booking with a pass the barcode band that opens it full
 * screen. The card opens the booking.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { WalletBooking } from '../../data/model';

const STRIPES = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 4, 1, 2, 1, 3, 1, 1, 2, 3, 1, 2];

function BarcodeBand({ color }: { readonly color: string }) {
  return (
    <View style={{ flexDirection: 'row', height: 40, gap: 3, overflow: 'hidden', opacity: 0.85 }}>
      {STRIPES.concat(STRIPES).map((width, index) => (
        <View key={index} style={{ width: width * 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function NextUpCard({
  booking,
  when,
  onOpen,
  onPass,
}: {
  readonly booking: WalletBooking;
  /** "Tomorrow 05:40", "Mon 12 Oct · 05:40". */
  readonly when: string;
  readonly onOpen: () => void;
  /** Present when the booking carries a scannable pass. */
  readonly onPass: (() => void) | null;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const leg = booking.segments[0];
  const where =
    leg === undefined
      ? (booking.location ?? '')
      : `${leg.dep_airport} → ${leg.arr_airport} · ${leg.carrier}${leg.flight_no}`;
  const eyebrow = t({ id: 'bookings.premium.nextUp', message: `Next up · ${when}` });
  return (
    <View
      style={{
        marginHorizontal: th.space.gap16,
        borderRadius: th.radius.hero,
        backgroundColor: th.color.inkSurface,
        boxShadow: th.shadow.ink,
        overflow: 'hidden',
      }}
      testID="bookings-next-up"
    >
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${eyebrow}. ${booking.title}. ${where}`}
        testID="bookings-open-details"
      >
        <View style={{ padding: 18, paddingBottom: onPass === null ? 18 : 12, gap: 6 }}>
          <Text variant="statLabel" color={th.color.onInkSurface} style={{ opacity: 0.6 }}>
            {eyebrow.toLocaleUpperCase()}
          </Text>
          <Text variant="stat" color={th.color.onInkSurface} numberOfLines={2}>
            {booking.title}
          </Text>
          {where === '' ? null : (
            <Text variant="label" color={th.color.onInkSurface} style={{ opacity: 0.7 }}>
              {where}
            </Text>
          )}
        </View>
      </PressableScale>
      {onPass === null ? null : (
        <PressableScale
          onPress={onPass}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'bookings.premium.showPass', message: 'Show the pass' })}
          testID="bookings-next-up-pass"
          style={{ marginHorizontal: 18, marginBottom: 18, borderRadius: 12, overflow: 'hidden' }}
        >
          <BarcodeBand color={th.color.onInkSurface} />
        </PressableScale>
      )}
    </View>
  );
}
