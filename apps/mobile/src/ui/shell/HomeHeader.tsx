import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useFontScale } from '@/lib/a11y/use-font-scale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Sticker } from '../sticker/Sticker';
import { Text } from '../text/Text';
import { degrees, makeStyles, MIN_TOUCH_TARGET, sizeToken, useTheme } from '../theme';
import { ShellBadge } from './TabBar';

export interface HomeHeaderMember {
  readonly initial: string;
  readonly color: string;
}

export interface HomeHeaderProps {
  readonly name: string;
  readonly crewName: string;
  readonly members: readonly HomeHeaderMember[];
  readonly unreadChat?: number | undefined;
  readonly unreadInbox?: number | undefined;
  readonly onOpenProfile: () => void;
  readonly onSwitchCrew: () => void;
  readonly onOpenChat: () => void;
  readonly onOpenInbox: () => void;
}

const AVATAR = sizeToken(tokens.size.avatar, 'md');
const SMALL_AVATAR = sizeToken(tokens.size.avatar, 'sm');
const ICON = tokens.space['20'];
const CARET = tokens.space['6'];
const RING_DEG = 14;
const MAX_FACES = 3;

const useStyles = makeStyles((t) => ({
  root: { paddingHorizontal: t.size.gutter, paddingVertical: t.space['8'] },
  target: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  avatar: {
    width: SMALL_AVATAR,
    height: SMALL_AVATAR,
    borderRadius: SMALL_AVATAR / 2,
    backgroundColor: t.color.paper.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: t.ring.cutout.widthPt,
    borderColor: t.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlap: { marginStart: -t.space['8'] },
  crewPill: {
    minHeight: MIN_TOUCH_TARGET,
    paddingStart: t.space['6'],
    paddingEnd: t.space['12'],
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: t.semantic.bg.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
  },
  bell: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: t.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { position: 'absolute', top: -t.space['4'], end: -t.space['4'] },
  crew: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  caret: {
    width: 0,
    height: 0,
    borderStartWidth: CARET,
    borderEndWidth: CARET,
    borderTopWidth: CARET,
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
    borderTopColor: t.semantic.text.primary,
  },
}));

function Glyph({ kind, color }: { readonly kind: 'chat' | 'bell'; readonly color: string }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Sticker
        kind={kind}
        name={kind}
        size={ICON}
        variant="mask"
        maskColor={color}
        sticker={null}
      />
    </View>
  );
}

/** The bell rings once whenever the unread count goes up (docs 3b-2 motion caption). */
function useBellRing(count: number | undefined) {
  const reduced = useReducedImpactMotion();
  const rotate = useSharedValue(0);
  useEffect(() => {
    if (!count || reduced) return;
    const beat = { duration: tokens.motion.duration.instant / 2 };
    rotate.value = withSequence(
      withTiming(RING_DEG, beat),
      withTiming(-RING_DEG, beat),
      withTiming(RING_DEG / 2, beat),
      withTiming(0, beat),
    );
  }, [count, reduced, rotate]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: degrees(rotate.value) }] }));
}

/** Home header (3b-2, 3b-6): greeting, crew switcher ▾, crew pill with chat badge, inbox bell. */
export function HomeHeader(props: HomeHeaderProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const ringStyle = useBellRing(props.unreadInbox);
  const { isLarge } = useFontScale();
  const { name, crewName } = props;
  const chat = props.unreadChat ?? 0;
  const inbox = props.unreadInbox ?? 0;
  const faces = props.members.slice(0, MAX_FACES);

  return (
    <Row style={styles.root} justify="space-between" align="center">
      <Stack gap="2" flex={1}>
        <Pressable
          testID="home-header-profile"
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'common.home.greeting', message: `Hey ${name}` })}
          onPress={props.onOpenProfile}
          style={styles.target}
        >
          <Row gap="6">
            <View style={styles.avatar}>
              <Text variant="label" color={theme.color.paper.ink}>
                {name.slice(0, 1)}
              </Text>
            </View>
            <Text variant="eyebrow">
              {t({ id: 'common.home.greeting', message: `Hey ${name}` })}
            </Text>
          </Row>
        </Pressable>
        <Pressable
          testID="home-header-crew"
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'common.home.switchCrew',
            message: `${crewName}, switch crew`,
          })}
          onPress={props.onSwitchCrew}
          style={styles.crew}
        >
          <Row gap="8">
            <Text variant="h3" numberOfLines={isLarge ? 2 : 1}>
              {crewName}
            </Text>
            <View style={styles.caret} />
          </Row>
        </Pressable>
      </Stack>
      <Row gap="8">
        <Pressable
          testID="home-header-chat"
          accessibilityRole="button"
          accessibilityLabel={
            chat > 0
              ? t({ id: 'common.home.chatUnread', message: `Crew chat, ${chat} new` })
              : t({ id: 'common.home.chat', message: 'Crew chat' })
          }
          onPress={props.onOpenChat}
          style={styles.crewPill}
        >
          <Row accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {faces.map((member, index) => (
              <View
                key={`${member.initial}-${index}`}
                style={[
                  styles.face,
                  index > 0 ? styles.overlap : null,
                  { backgroundColor: member.color },
                ]}
              >
                <Text variant="label" color={theme.semantic.text.onAccent}>
                  {member.initial}
                </Text>
              </View>
            ))}
          </Row>
          <Glyph kind="chat" color={theme.semantic.text.primary} />
          {chat > 0 ? (
            <ShellBadge count={chat} style={styles.badge} testID="home-header-chat-badge" />
          ) : null}
        </Pressable>
        <Pressable
          testID="home-header-inbox"
          accessibilityRole="button"
          accessibilityLabel={
            inbox > 0
              ? t({ id: 'common.home.inboxUnread', message: `Inbox, ${inbox} new` })
              : t({ id: 'common.home.inbox', message: 'Inbox' })
          }
          onPress={props.onOpenInbox}
          style={styles.bell}
        >
          <Animated.View style={ringStyle}>
            <Glyph kind="bell" color={theme.semantic.text.primary} />
          </Animated.View>
          {inbox > 0 ? (
            <ShellBadge count={inbox} style={styles.badge} testID="home-header-inbox-badge" />
          ) : null}
        </Pressable>
      </Row>
    </Row>
  );
}
