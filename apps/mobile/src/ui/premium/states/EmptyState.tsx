import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CritterSticker } from '../stickers/CritterSticker';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface EmptyStateProps {
  readonly title: string;
  readonly line: string;
  /** The critter in the disc. @default the sleeping gecko */
  readonly critter?: { readonly kind: string; readonly name: string };
  /** The tilted check sticker on the disc's shoulder ("all done"). @default true */
  readonly check?: boolean;
  /** A way forward under the line (a button), so the screen never dead-ends. */
  readonly action?: ReactNode;
  readonly testID?: string;
}

/**
 * How far a critter's art sits off its box's centre, as a share of its size: the gecko's curled
 * tail and sleep mark weigh on its right, so in the round disc it read off-centre.
 */
const OPTICAL_SHIFT: Readonly<Record<string, number>> = { gecko: 0.045 };

/**
 * The empty state: a 180 white disc holding a 140 sleeping critter with a tilted check sticker, a
 * 26/700 headline and a 14/1.45 muted line. Past items ("Earlier") follow it on the screen.
 */
export function EmptyState({
  title,
  line,
  critter,
  check = true,
  action,
  testID,
}: EmptyStateProps) {
  const t = usePremiumTheme();
  const disc = t.size.emptyDisc;
  const kind = critter?.kind ?? 'gecko';
  const shift = (OPTICAL_SHIFT[kind] ?? 0) * t.size.emptyCritter;
  return (
    <View testID={testID} style={{ alignItems: 'center', paddingHorizontal: t.space.gutter }}>
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: t.radius.emptyDisc,
          backgroundColor: t.color.card,
          boxShadow: t.shadow.emptyDisc,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={shift === 0 ? null : { transform: [{ translateX: -shift }] }}>
          <CritterSticker
            kind={kind}
            name={critter?.name ?? title}
            size={t.size.emptyCritter}
            pose="sleep"
            edge={false}
          />
        </View>
        {check ? (
          <View
            accessible={false}
            style={{
              position: 'absolute',
              top: 0,
              end: -t.space.gap10,
              transform: [{ rotate: `${String(t.tilt.emptyCheck)}deg` }],
            }}
          >
            <CritterSticker kind="check" name={title} size={t.size.emptyCheck} />
          </View>
        ) : null}
      </View>
      <View style={{ marginTop: t.space.emptyTextGap, alignItems: 'center', gap: t.space.gap6 }}>
        <Text variant="emptyTitle" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="emptyLine" tone="muted" align="center">
          {line}
        </Text>
      </View>
      {action === undefined ? null : <View style={{ marginTop: t.space.gap16 }}>{action}</View>}
    </View>
  );
}
