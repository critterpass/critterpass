import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { I18nManager, View } from 'react-native';
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
import { Avatar } from '../people/Avatar';
import { PressScale } from '../press/PressScale';
import { useHeaderOverlapGuard } from '../qa/header-overlap';
import { Stack } from '../layout/Stack';
import { Sticker } from '../sticker/Sticker';
import { Text } from '../text/Text';
import { degrees, makeStyles, MIN_TOUCH_TARGET, sizeToken, useTheme } from '../theme';
import { ShellBadge } from './TabBar';

export interface HomeHeaderMember {
  readonly name: string;
  /** The member's user id: the pill draws the face they chose, as the crews sheet and chat do. */
  readonly uid?: string | null | undefined;
  /** 0-based crew join order (the member colour behind an initial). */
  readonly joinIndex: number;
}

export interface HomeHeaderProps {
  readonly name: string;
  /** The signed-in member: the greeting draws the face they chose. */
  readonly me?: { readonly uid: string; readonly joinIndex: number } | undefined;
  /** In place of "Hey {name}", when there is no name to greet by. */
  readonly greeting?: string | undefined;
  readonly crewName: string;
  readonly members: readonly HomeHeaderMember[];
  /** Another crew of the member's has unread chat: a dot beside the switcher. */
  readonly otherCrewsUnread?: boolean | undefined;
  readonly unreadChat?: number | undefined;
  readonly unreadInbox?: number | undefined;
  readonly onOpenProfile: () => void;
  readonly onSwitchCrew: () => void;
  readonly onOpenChat: () => void;
  readonly onOpenInbox: () => void;
}

const SMALL_AVATAR = sizeToken(tokens.size.avatar, 'sm');
/** The pill's faces: a small avatar inside its cut-out ring, overlapping like `AvatarStack`. */
const FACE = SMALL_AVATAR + tokens.ring.cutout.widthPt * 2;
const FACE_OVERLAP = -7;
/** The crew name is h2 at the size 3b-2 sets it (the bottom of the h2 range). */
const CREW_NAME_SIZE = tokens.type.h2.fontSizeMin ?? tokens.type.h2.fontSize;
const ICON = tokens.space['20'];
const CARET = tokens.space['6'];
const RING_DEG = 14;
const MAX_FACES = 3;

const useStyles = makeStyles((t) => ({
  root: { paddingHorizontal: t.size.gutter, paddingVertical: t.space['8'] },
  greeting: { alignSelf: 'flex-start', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  avatar: {
    width: SMALL_AVATAR,
    height: SMALL_AVATAR,
    borderRadius: SMALL_AVATAR / 2,
    backgroundColor: t.color.paper.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: t.ring.cutout.widthPt,
    borderColor: t.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlap: { marginStart: FACE_OVERLAP },
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
  dot: {
    width: t.space['8'],
    height: t.space['8'],
    borderRadius: t.space['4'],
    backgroundColor: t.semantic.state.urgent,
  },
  crew: { flex: 1, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  crewName: { flexShrink: 1 },
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

export interface HomeHeaderBellProps {
  /** Things in the inbox that need the member. */
  readonly count?: number | undefined;
  readonly onPress: () => void;
}

/** The inbox bell with its needs-you count: in the Home header, and alone on a Home without a crew. */
export function HomeHeaderBell({ count = 0, onPress }: HomeHeaderBellProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const ringStyle = useBellRing(count);
  return (
    <PressScale
      testID="home-header-inbox"
      accessibilityLabel={
        count > 0
          ? t({ id: 'common.home.inboxUnread', message: `Inbox, ${count} new` })
          : t({ id: 'common.home.inbox', message: 'Inbox' })
      }
      onPress={onPress}
      style={styles.bell}
    >
      <Animated.View style={ringStyle}>
        <Glyph kind="bell" color={theme.semantic.text.primary} />
      </Animated.View>
      {count > 0 ? (
        <ShellBadge count={count} style={styles.badge} testID="home-header-inbox-badge" />
      ) : null}
    </PressScale>
  );
}

/** Home header (3b-2, 3b-6): greeting, crew switcher ▾, crew pill with chat badge, inbox bell. */
export function HomeHeader(props: HomeHeaderProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { isLarge } = useFontScale();
  const { name, crewName } = props;
  const greeting = props.greeting ?? t({ id: 'common.home.greeting', message: `Hey ${name}` });
  const chat = props.unreadChat ?? 0;
  const faces = props.members.slice(0, MAX_FACES);
  const qa = useHeaderOverlapGuard('home-header');

  return (
    <Stack style={styles.root} onLayout={qa.onLayout}>
      <PressScale
        testID="home-header-profile"
        accessibilityLabel={greeting}
        onPress={props.onOpenProfile}
        style={styles.greeting}
      >
        <Row gap="6">
          {props.me == null ? (
            <View style={styles.avatar}>
              <Text variant="label" color={theme.color.paper.ink}>
                {name.slice(0, 1)}
              </Text>
            </View>
          ) : (
            <Avatar
              name={name}
              uid={props.me.uid}
              joinIndex={props.me.joinIndex}
              size="sm"
              cutout={false}
              decorative
            />
          )}
          <Text variant="eyebrow" numberOfLines={1} style={styles.crewName}>
            {greeting}
          </Text>
          <Text variant="eyebrow" accessibilityElementsHidden>
            {I18nManager.isRTL ? '‹' : '›'}
          </Text>
        </Row>
      </PressScale>
      <Row justify="space-between" align="center" gap="12">
        <PressScale
          testID="home-header-crew"
          widthClass="wide"
          accessibilityLabel={t({
            id: 'common.home.switchCrew',
            message: `${crewName}, switch crew`,
          })}
          onPress={props.onSwitchCrew}
          style={styles.crew}
        >
          <Row gap="8">
            <Text
              variant="h2"
              // A fixed, legible size: a long name wraps to a second line and ends in an
              // ellipsis rather than shrinking (larger text sizes allow a third).
              designSize={CREW_NAME_SIZE}
              autoFit={false}
              numberOfLines={isLarge ? 3 : 2}
              ellipsizeMode="tail"
              style={styles.crewName}
              testID="home-header-crew-name"
            >
              {crewName}
            </Text>
            <View style={styles.caret} ref={qa.ref('crew-caret')} />
            {props.otherCrewsUnread === true ? (
              <View style={styles.dot} testID="home-header-other-crews-unread" />
            ) : null}
          </Row>
        </PressScale>
        <Row gap="8">
          <View ref={qa.ref('chat')}>
            <PressScale
              testID="home-header-chat"
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
                    key={member.uid ?? `${member.name}-${index}`}
                    style={[styles.face, index > 0 ? styles.overlap : null]}
                  >
                    <Avatar
                      name={member.name}
                      uid={member.uid}
                      joinIndex={member.joinIndex}
                      size="sm"
                      cutout={false}
                      decorative
                    />
                  </View>
                ))}
              </Row>
              <Glyph kind="chat" color={theme.semantic.text.primary} />
              {chat > 0 ? (
                <ShellBadge count={chat} style={styles.badge} testID="home-header-chat-badge" />
              ) : null}
            </PressScale>
          </View>
          <View ref={qa.ref('inbox')}>
            <HomeHeaderBell count={props.unreadInbox} onPress={props.onOpenInbox} />
          </View>
        </Row>
      </Row>
    </Stack>
  );
}
