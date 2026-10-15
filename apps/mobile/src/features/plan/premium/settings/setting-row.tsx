/** A row of trip settings (4.53): its sticker tile, label and line, the value and a chevron. */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text, usePremiumTheme } from '@/ui/premium';

export function SettingRow(props: {
  /** The row's sticker tile (4.53's trip rows). */
  readonly leading?: ReactNode;
  readonly label: string;
  readonly line?: string | undefined;
  readonly value?: string | undefined;
  readonly trailing?: ReactNode;
  readonly onPress?: ((y: number) => void) | undefined;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <Pressable
      onPress={
        props.onPress === undefined
          ? undefined
          : (event) => props.onPress?.(event.nativeEvent.pageY)
      }
      disabled={props.onPress === undefined}
      accessibilityRole={props.onPress === undefined ? 'text' : 'button'}
      accessibilityLabel={[props.label, props.line, props.value].filter(Boolean).join(', ')}
      testID={props.testID}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        paddingHorizontal: theme.space.gap16,
        paddingVertical: theme.space.gap8,
        backgroundColor: pressed ? theme.color.control : undefined,
      })}
    >
      {props.leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body">{props.label}</Text>
        {props.line === undefined ? null : (
          <Text variant="captionMuted" tone="muted">
            {props.line}
          </Text>
        )}
      </View>
      {props.value === undefined ? null : (
        <Text variant="rowText" tone="muted" numberOfLines={1}>
          {props.value}
        </Text>
      )}
      {props.trailing ??
        (props.onPress === undefined ? null : (
          <Icon name="forward" size={16} color={theme.color.placeholder} />
        ))}
    </Pressable>
  );
}
