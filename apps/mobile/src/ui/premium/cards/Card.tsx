import { Children, Fragment, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface CardProps {
  readonly children?: ReactNode;
  /** @default 22 */
  readonly radius?: number;
  /** Inner padding; rows and media bring their own, so a card has none by default. */
  readonly padded?: boolean;
  /** Past items under an empty state draw at the design's .85. */
  readonly earlier?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * A white card on the ground: `card` elevation in light, a hairline instead of a shadow in dark.
 * Never put glass inside a card.
 */
export function Card({
  children,
  radius,
  padded = false,
  earlier = false,
  style,
  testID,
}: CardProps) {
  const t = usePremiumTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: radius ?? t.radius.card,
          backgroundColor: t.color.card,
          boxShadow: t.shadow.card,
          ...(padded
            ? { paddingVertical: t.space.bannerPadV, paddingHorizontal: t.space.rowPadH }
            : {}),
          ...(earlier ? { opacity: t.opacity.earlier } : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface ListCardProps extends Omit<CardProps, 'padded'> {
  readonly children?: ReactNode;
}

/** A list card: rows on one white card, separated by 0.5 hairlines; clips its rows to the radius. */
export function ListCard({ children, ...card }: ListCardProps) {
  const t = usePremiumTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <Card {...card} style={[{ overflow: 'hidden' }, card.style]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? (
            <View style={{ height: t.size.hairline, backgroundColor: t.color.hairline }} />
          ) : null}
          {row}
        </Fragment>
      ))}
    </Card>
  );
}
