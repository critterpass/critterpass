/**
 * A home-screen widget as the gallery draws it: its colour, its name and the one thing it shows
 * (the countdown's real days, a tick for the vote, the day's bars, a wallet, the crew, the next
 * flight, a critter). `size` is the tile's height; a wide widget is twice as wide.
 */
import { View } from 'react-native';

import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  CritterSticker,
  Icon,
  Text,
  usePremiumTheme,
  type PremiumIconName,
  type PremiumTheme,
} from '@/ui/premium';

import type { GalleryKind } from '../../widget-gallery/gallery-rows';

const TOKEK = guideSticker('tokek');

/** The widgets the gallery previews as medium (two tiles wide). */
export const WIDE_WIDGETS: readonly GalleryKind[] = ['vote', 'today'];

function look(th: PremiumTheme, kind: GalleryKind): { readonly bg: string; readonly fg: string } {
  switch (kind) {
    case 'countdown':
      return { bg: th.accent.sun, fg: th.color.onAccent };
    case 'vote':
      return { bg: th.accent.tangerine, fg: th.color.onAccent };
    case 'today':
      return { bg: th.color.card, fg: th.color.ink };
    case 'balances':
      return { bg: th.accent.mint, fg: th.color.onAccent };
    case 'crew':
      return { bg: th.accent.pink, fg: th.color.onAccent };
    case 'next_flight':
      return { bg: th.color.inkSurface, fg: th.color.onInkSurface };
    case 'critterdex':
      return { bg: th.accent.sky, fg: th.color.onAccent };
  }
}

const GLYPHS: Partial<Record<GalleryKind, PremiumIconName>> = {
  vote: 'check',
  balances: 'wallet',
  crew: 'people',
  next_flight: 'ticket',
};

export function WidgetFace(props: {
  readonly kind: GalleryKind;
  readonly title: string;
  readonly countdownDays: number | null;
  readonly size: number;
  readonly wide?: boolean;
  /** On the countdown's days. */
  readonly daysTestID?: string;
}) {
  const th = usePremiumTheme();
  const { bg, fg } = look(th, props.kind);
  const art = props.size * 0.42;
  const glyph = GLYPHS[props.kind];
  const middle =
    props.kind === 'countdown' ? (
      props.countdownDays === null ? (
        <Icon name="pass" size={art} color={fg} />
      ) : (
        <Text
          variant={props.size < 80 ? 'headline' : 'display'}
          color={fg}
          {...(props.daysTestID === undefined ? {} : { testID: props.daysTestID })}
        >
          {String(props.countdownDays)}
        </Text>
      )
    ) : props.kind === 'today' ? (
      <View style={{ gap: props.size * 0.06, width: '70%' }}>
        {[th.accent.sun, th.accent.mint, th.accent.sky].map((colour) => (
          <View
            key={colour}
            style={{ height: props.size * 0.07, borderRadius: 3, backgroundColor: colour }}
          />
        ))}
      </View>
    ) : props.kind === 'critterdex' ? (
      <CritterSticker kind={TOKEK.kind} name={TOKEK.name} seed={TOKEK.seed} size={art * 1.2} />
    ) : glyph === undefined ? null : (
      <Icon name={glyph} size={art} color={fg} />
    );
  const small = props.size < 80;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: props.wide === true ? props.size * 2 + 22 : props.size,
        height: props.size,
        borderRadius: props.size * 0.22,
        backgroundColor: bg,
        padding: small ? 0 : th.space.gap12,
        alignItems: small ? 'center' : 'flex-start',
        justifyContent: small ? 'center' : 'space-between',
        boxShadow: th.shadow.raised,
        overflow: 'hidden',
      }}
    >
      {small ? null : (
        <Text variant="captionMuted" color={fg} numberOfLines={1}>
          {props.title}
        </Text>
      )}
      <View style={small ? undefined : { alignSelf: 'center' }}>{middle}</View>
      {small ? null : <View />}
    </View>
  );
}
