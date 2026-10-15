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
  /**
   * The tilted check sticker on the disc's shoulder, for a state that means "all done" (all caught
   * up, all square, all rated). Nothing yet, gone or failed states leave it off. @default false
   */
  readonly check?: boolean;
  /** A way forward under the line (a button), so the screen never dead-ends. */
  readonly action?: ReactNode;
  /**
   * `page` (the default) is the 180 disc for a screen with nothing else to show; `inline` a
   * smaller one for an empty section or card among other content (no ideas yet, no stickers).
   */
  readonly size?: 'page' | 'inline';
  /**
   * Takes the space left on the screen and sits in its optical centre (a little above the middle),
   * instead of hanging under the header with the rest of the screen blank.
   */
  readonly fill?: boolean;
  readonly testID?: string;
}

/** The inline disc and critter, as a share of the page ones. */
const INLINE_SCALE = 0.6;

/**
 * How far a critter's art sits off its box's centre, as a share of its size: the gecko's curled
 * tail and sleep mark weigh on its right, so in the round disc it read off-centre.
 */
const OPTICAL_SHIFT: Readonly<Record<string, number>> = { gecko: 0.045 };

/**
 * The empty state: a 180 white disc holding a 140 sleeping critter (a tilted check sticker when
 * it is all done), a 26/700 headline, a 14/1.45 muted line and the way forward. Past items
 * ("Earlier") follow it on the screen. Screens with nothing else to show `fill` the space; a
 * section among others is `inline`. Every empty or error state is built from it rather than a
 * bare grey line.
 */
export function EmptyState({
  title,
  line,
  critter,
  check = false,
  action,
  size = 'page',
  fill = false,
  testID,
}: EmptyStateProps) {
  const t = usePremiumTheme();
  const inline = size === 'inline';
  const scale = inline ? INLINE_SCALE : 1;
  const disc = Math.round(t.size.emptyDisc * scale);
  const critterSize = Math.round(t.size.emptyCritter * scale);
  const kind = critter?.kind ?? 'gecko';
  const shift = (OPTICAL_SHIFT[kind] ?? 0) * critterSize;
  return (
    <View
      testID={testID}
      style={[
        {
          alignItems: 'center',
          paddingHorizontal: t.space.gutter,
          paddingVertical: inline ? t.space.gap16 : t.space.emptyTextGap,
        },
        // The optical centre: a little more room under it than over it.
        fill
          ? { flexGrow: 1, justifyContent: 'center', paddingBottom: t.space.emptyTextGap * 2 }
          : null,
      ]}
    >
      <View
        style={{
          width: disc,
          height: disc,
          borderRadius: disc / 2,
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
            size={critterSize}
            pose="sleep"
            // On the dark disc the art's black outline and sleep mark sank into it: the die-cut
            // edge keeps them apart, as the check's own edge does.
            edge={t.scheme === 'dark'}
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
            <CritterSticker
              kind="check"
              name={title}
              size={Math.round(t.size.emptyCheck * scale)}
            />
          </View>
        ) : null}
      </View>
      <View
        style={{
          marginTop: inline ? t.space.gap16 : t.space.emptyTextGap,
          alignItems: 'center',
          gap: t.space.gap6,
        }}
      >
        <Text variant={inline ? 'title' : 'emptyTitle'} align="center" accessibilityRole="header">
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
