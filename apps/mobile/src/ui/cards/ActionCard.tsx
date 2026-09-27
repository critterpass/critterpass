import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSlideOff, useSlideOffHeightStyle } from '@/motion/patterns/slide-off';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { Card } from './Card';
import { SecondaryText } from './SecondaryText';
import type { CardTone } from './tone';
import { WidthFraction } from './WidthFraction';

export interface ActionCardProps {
  readonly title: string;
  readonly body?: string;
  readonly leading?: ReactNode;
  /** `InlineAction`s / `PillButton`s answering the card. */
  readonly actions?: ReactNode;
  readonly tone?: CardTone;
  /** Once true the card slides off (fade under reduced motion) and its row collapses. */
  readonly handled?: boolean;
  /** Called after the row has collapsed, so the list can drop it. */
  readonly onDismissed?: () => void;
  readonly testID?: string;
}

/** An inbox card that asks for something and slides away once handled (3b-4, 3k-5). */
export function ActionCard({
  title,
  body,
  leading,
  actions,
  tone,
  handled = false,
  onDismissed,
  testID,
}: ActionCardProps) {
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const { style, heightFactor } = useSlideOff({
    active: handled,
    ...(onDismissed ? { onDismissed } : {}),
  });
  const collapse = useSlideOffHeightStyle(heightFactor, layout?.height ?? 0);
  const onLayout = (event: LayoutChangeEvent) => {
    if (handled) return;
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };
  return (
    <Animated.View
      testID={testID}
      style={handled && layout ? [{ overflow: 'hidden' }, collapse] : undefined}
      accessibilityElementsHidden={handled}
      importantForAccessibility={handled ? 'no-hide-descendants' : 'auto'}
    >
      <View onLayout={onLayout}>
        <WidthFraction layout={handled ? layout : null} style={style}>
          <Card {...(tone ? { tone } : {})}>
            <Stack gap="12">
              <Row gap="12" align="center">
                {leading}
                <Stack gap="4" flex={1}>
                  <Text variant="title">{title}</Text>
                  {body ? <SecondaryText>{body}</SecondaryText> : null}
                </Stack>
              </Row>
              {actions ? (
                <Row gap="8" wrap>
                  {actions}
                </Row>
              ) : null}
            </Stack>
          </Card>
        </WidthFraction>
      </View>
    </Animated.View>
  );
}
