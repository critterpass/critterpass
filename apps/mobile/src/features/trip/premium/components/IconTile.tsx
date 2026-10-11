import { View } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

import { LineIcon, type LineIconName } from './LineIcon';

/** The tinted square that leads a wallet or trip row: a line icon on a status tint. */
export function IconTile({
  name,
  bg,
  color,
  size = 40,
}: {
  readonly name: LineIconName;
  readonly bg: string;
  readonly color: string;
  /** 40 in lists, 48 on the bookings stack. */
  readonly size?: number;
}) {
  const t = usePremiumTheme();
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size >= 48 ? 14 : t.radius.dayBadge,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LineIcon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}
