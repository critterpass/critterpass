/**
 * The crew chat's header (5.01): a fade from the ground colour so the newest card scrolls away under
 * it, the glass back circle, the crew name with one line under it (people and the guide, who is
 * typing, read-only, or a NO SIGNAL chip), another area's chip under it (BOOSTED), and the glass
 * "Map" pill. Tapping the name opens the
 * crew's settings.
 */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassPill,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { CREW_ROUTES, crewSettingsRoute } from '../../crews-sheet/routes';
import { ChatHeaderBadge, chatMapTarget } from '../../chat/slots';
import { headerFade } from '../premium-paint';
import { NoSignalChip } from './chat-chips';

/** Height of the header block under the status bar (controls row and its fade). */
export const CHAT_HEADER_HEIGHT = 58;

export type HeaderLine =
  | { readonly kind: 'people'; readonly count: number; readonly guideName: string | null }
  | { readonly kind: 'typing'; readonly names: readonly string[] }
  | { readonly kind: 'readOnly'; readonly leftOn: string | null }
  | { readonly kind: 'offline' };

export function headerLine(line: HeaderLine): string | null {
  switch (line.kind) {
    case 'people': {
      const people = t({
        id: 'chat.premium.header.people',
        message: plural(line.count, { one: '# person', other: '# people' }),
      });
      if (line.guideName === null) return people;
      const guide = line.guideName;
      return t({ id: 'chat.premium.header.withGuide', message: `${people} · ${guide}'s in here` });
    }
    case 'typing': {
      const [first, second] = line.names;
      if (first === undefined) return null;
      if (second === undefined) {
        return t({ id: 'chat.premium.header.typingOne', message: `${first} is typing` });
      }
      if (line.names.length === 2) {
        return t({
          id: 'chat.premium.header.typingTwo',
          message: `${first} and ${second} are typing`,
        });
      }
      return t({ id: 'chat.premium.header.typingMany', message: `${first} and others are typing` });
    }
    case 'readOnly': {
      if (line.leftOn === null) {
        return t({ id: 'chat.premium.header.readOnly', message: 'Read only' });
      }
      const day = line.leftOn;
      return t({
        id: 'chat.premium.header.readOnlySince',
        message: `Read only · you left on ${day}`,
      });
    }
    case 'offline':
      return null;
  }
}

const useStyles = makePremiumStyles((th) => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  row: {
    height: CHAT_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: th.space.gap16,
    gap: th.space.gap8,
  },
  titles: { flex: 1, alignItems: 'center', gap: 2 },
  side: { minWidth: th.size.glassNav, alignItems: 'flex-end' },
}));

export interface ChatHeaderProps {
  readonly crewId: string;
  readonly crewName: string | null;
  readonly line: HeaderLine;
}

export function ChatHeader({ crewId, crewName, line }: ChatHeaderProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const map = chatMapTarget();
  const title = crewName ?? t({ id: 'chat.header.fallbackTitle', message: 'Crew chat' });
  const subtitle = headerLine(line);
  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="chat-header">
      {/* The fade: solid ground behind the controls, clearing towards the timeline. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: headerFade(th.color.ground),
          },
        ]}
      />
      <View style={styles.row}>
        <GlassIconButton
          icon="back"
          label={t({ id: 'chat.premium.header.back', message: 'Back' })}
          onPress={() => (router.canGoBack() ? router.back() : router.replace(CREW_ROUTES.home))}
          testID="chat-back"
        />
        <PressableScale
          style={styles.titles}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={t({ id: 'chat.header.openSettings', message: 'Opens crew settings' })}
          onPress={() => router.push(crewSettingsRoute(crewId))}
          testID="chat-crew-settings"
        >
          <Text variant="navTitle" numberOfLines={1} align="center" accessibilityRole="header">
            {title}
          </Text>
          {line.kind === 'offline' ? (
            <NoSignalChip />
          ) : subtitle === null ? null : (
            <Text variant="navSubtitle" tone="muted" numberOfLines={1} align="center">
              {subtitle}
            </Text>
          )}
          {/* Another area's chip under the name (BOOSTED while the trip's boost is on). */}
          <ChatHeaderBadge crewId={crewId} />
        </PressableScale>
        <View style={styles.side}>
          {map === null ? null : (
            <GlassPill
              label={t({ id: 'chat.header.map', message: 'Map' })}
              icon="pin"
              onPress={() => map(crewId)}
              testID="chat-map"
            />
          )}
        </View>
      </View>
    </View>
  );
}
