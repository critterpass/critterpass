/** The stop sheet's labelled sections and its tappable rows (a change waiting, the place). */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, ListCard, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export function Section(props: { readonly label: string; readonly children: ReactNode }) {
  const theme = usePremiumTheme();
  return (
    <View style={{ gap: theme.space.gap6 }}>
      <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
        {props.label}
      </Text>
      {props.children}
    </View>
  );
}

export function LinkRow(props: {
  readonly title: string;
  readonly line: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <ListCard>
      <PressableScale
        onPress={props.onPress}
        accessibilityRole="button"
        testID={props.testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap10,
          paddingVertical: theme.space.gap10,
          paddingHorizontal: theme.space.rowPadH,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">{props.title}</Text>
          <Text variant="captionMuted" tone="muted">
            {props.line}
          </Text>
        </View>
        <Icon name="forward" size={16} color={theme.color.placeholder} />
      </PressableScale>
    </ListCard>
  );
}
