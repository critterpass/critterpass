import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import type { Theme } from '../theme';
import { makeStyles, MIN_TOUCH_TARGET, sizeToken, useTheme } from '../theme';

export type HeaderPillTone = 'action' | 'private' | 'live' | 'offline' | 'boosted' | 'countdown';

const PILL_HEIGHT = sizeToken(tokens.size.headerPill, 'height');
const HIT_SLOP = Math.max(0, (MIN_TOUCH_TARGET - PILL_HEIGHT) / 2);
const DOT = tokens.space['8'];

function colours(theme: Theme, tone: HeaderPillTone): { background: string; text: string } {
  const { semantic } = theme;
  switch (tone) {
    case 'action':
      return { background: semantic.bg.control, text: semantic.text.primary };
    case 'private':
      return { background: semantic.bg.control, text: semantic.text.secondary };
    case 'live':
      return { background: semantic.state.urgent, text: semantic.text.onAccent };
    case 'offline':
      return { background: semantic.state.warning, text: semantic.text.onAccent };
    case 'boosted':
      return { background: semantic.brand.boost, text: semantic.text.onAccent };
    case 'countdown':
      return { background: semantic.action.primary, text: semantic.text.onAccent };
  }
}

const useStyles = makeStyles((t) => ({
  pill: {
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    paddingHorizontal: t.space['14'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['6'],
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
}));

export interface HeaderPillProps {
  readonly label: string;
  readonly tone?: HeaderPillTone | undefined;
  /** Only action pills are pressable; status pills are read-only labels. */
  readonly onPress?: (() => void) | undefined;
  readonly icon?: ReactNode;
  readonly testID?: string | undefined;
}

/**
 * Header pill: an action (tap target) or a status (ONLY YOU SEE THIS, LIVE, NO SIGNAL, BOOSTED,
 * countdown). Status is never colour-only: the word is always there; LIVE and NO SIGNAL add a dot.
 */
export function HeaderPill({ label, tone = 'action', onPress, icon, testID }: HeaderPillProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { background, text } = colours(theme, tone);
  const dot = tone === 'live' || tone === 'offline';
  const content = (
    <>
      {dot ? <View style={[styles.dot, { backgroundColor: text }]} /> : null}
      {icon}
      <Text variant="label" color={text} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  if (tone === 'action' && onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        hitSlop={HIT_SLOP}
        onPress={onPress}
        style={[styles.pill, { backgroundColor: background }]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion={tone === 'countdown' ? undefined : 'polite'}
      style={[styles.pill, { backgroundColor: background }]}
    >
      {content}
    </View>
  );
}

/** Row of header pills aligned to the header's end. */
export function HeaderPills({ children }: { readonly children: ReactNode }) {
  return (
    <Row gap="8" justify="flex-end">
      {children}
    </Row>
  );
}
