import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface RowProps {
  readonly title: string;
  readonly subtitle?: string;
  /** A day badge, avatar or critter. */
  readonly leading?: ReactNode;
  /** A status tag, toggle or any control. */
  readonly trailing?: ReactNode;
  /** A trailing time or amount, drawn 12 muted ("1h"). */
  readonly trailingText?: string;
  /** `person` rows (avatar + one line + time) run 14 pt; `item` rows 15/600 over 12.5 muted. */
  readonly variant?: 'item' | 'person';
  /** The leading element is a day badge: the row tucks in to 10 on its leading side. */
  readonly badgeLeads?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

/** A list row for `ListCard`: leading badge or avatar, title and subtitle, trailing tag or time. */
export function Row({
  title,
  subtitle,
  leading,
  trailing,
  trailingText,
  variant = 'item',
  badgeLeads = false,
  onPress,
  accessibilityHint,
  testID,
}: RowProps) {
  const t = usePremiumTheme();
  const person = variant === 'person';
  const label = [title, subtitle, trailingText].filter((s) => s !== undefined).join(', ');
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap12,
        minHeight: t.size.hit,
        paddingVertical: t.space.rowPadV,
        paddingStart: badgeLeads ? t.space.rowPadLeadBadge : t.space.rowPadH,
        paddingEnd: t.space.rowPadH,
        backgroundColor: pressed ? t.color.control : undefined,
      }}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant={person ? 'rowText' : 'rowTitle'}>{title}</Text>
        {subtitle === undefined ? null : (
          <Text variant={person ? 'captionMuted' : 'caption'} tone="muted">
            {subtitle}
          </Text>
        )}
      </View>
      {trailingText === undefined ? null : (
        <Text variant="captionMuted" tone="muted">
          {trailingText}
        </Text>
      )}
      {trailing}
    </View>
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} accessible accessibilityLabel={label}>
        {content(false)}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

export interface DayBadgeProps {
  /** Day of the month ("4"). */
  readonly day: string;
  /** Short weekday ("THU"). */
  readonly weekday: string;
  /** The day's colour (days keep one colour everywhere). */
  readonly color: string;
}

/** The 42×44 day badge that leads a plan row: 17/800 day over 9.5/700 weekday on the day colour. */
export function DayBadge({ day, weekday, color }: DayBadgeProps) {
  const t = usePremiumTheme();
  return (
    <View
      accessible={false}
      style={{
        width: t.size.dayBadgeWidth,
        height: t.size.dayBadgeHeight,
        borderRadius: t.radius.dayBadge,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.size.dayBadgeGap,
      }}
    >
      <Text variant="dayBadgeDay" tone="onAccent">
        {day}
      </Text>
      <Text variant="dayBadgeWeekday" tone="onAccent">
        {weekday}
      </Text>
    </View>
  );
}
