/**
 * The chat's panels: the voice recorder bar, the read-only bar of a member who left (5.06), the
 * guide's typing bubble (5.12) and a brand-new chat's welcome with its starters (5.02).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { Doodle, type DoodleName } from './doodle';

const useStyles = makePremiumStyles((th) => ({
  readOnly: {
    paddingHorizontal: th.space.gap16,
    paddingTop: th.space.gap16,
    borderTopWidth: th.size.hairline,
    borderTopColor: th.color.hairline,
    backgroundColor: th.color.ground,
  },
  lockDisc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.control,
  },
  recorder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap10,
    marginHorizontal: th.space.gap12,
    marginTop: th.space.gap8,
    paddingHorizontal: th.space.gap14,
    height: 48,
    borderRadius: 24,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: th.accent.pink },
  typing: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: th.radius.banner,
    borderBottomLeftRadius: 6,
    backgroundColor: th.color.banner.guide.bg,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: th.color.guideName },
  starter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap8,
    alignSelf: 'flex-start',
    height: 44,
    paddingStart: th.space.gap8,
    paddingEnd: th.space.gap16,
    borderRadius: 22,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.float,
  },
}));

export function RecorderBar({
  elapsedMs,
  onSend,
  onCancel,
}: {
  readonly elapsedMs: number;
  readonly onSend: () => void;
  readonly onCancel: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const seconds = Math.floor(elapsedMs / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <View style={styles.recorder} testID="chat-recorder">
      <View style={styles.recDot} />
      <Text variant="rowTextStrong" style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
        {clock}
      </Text>
      <PressableScale onPress={onCancel} accessibilityRole="button" testID="chat-recorder-cancel">
        <Text variant="textButton" tone="muted">
          {t({ id: 'chat.premium.recorder.cancel', message: 'Cancel' })}
        </Text>
      </PressableScale>
      <PressableScale onPress={onSend} accessibilityRole="button" testID="chat-recorder-send">
        <Text variant="textButton" color={th.color.ink}>
          {t({ id: 'chat.premium.recorder.send', message: 'Send' })}
        </Text>
      </PressableScale>
    </View>
  );
}

export function ReadOnlyBar({
  crewName,
  onRejoin,
  onRemove,
}: {
  readonly crewName: string;
  readonly onRejoin: () => void;
  readonly onRemove: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.readOnly, { paddingBottom: Math.max(insets.bottom, 16) }]}
      testID="chat-former-bar"
    >
      <View style={{ flexDirection: 'row', gap: th.space.gap12, alignItems: 'center' }}>
        <View style={styles.lockDisc}>
          <Icon name="lock" size={18} color={th.color.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">
            {t({ id: 'chat.premium.former.title', message: `You're not in ${crewName} now` })}
          </Text>
          <Text variant="caption" tone="muted">
            {t({
              id: 'chat.premium.former.body',
              message: 'Photos and the recap stay yours. To post again, ask to rejoin.',
            })}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: th.space.gap8, marginTop: th.space.gap14 }}>
        <View style={{ flex: 1 }}>
          <Button
            size="medium"
            label={t({ id: 'chat.premium.former.rejoin', message: 'Ask to rejoin' })}
            onPress={onRejoin}
            testID="chat-rejoin"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            size="medium"
            variant="secondary"
            label={t({ id: 'chat.premium.former.remove', message: 'Remove chat' })}
            onPress={onRemove}
            testID="chat-remove"
          />
        </View>
      </View>
    </View>
  );
}

export function GuideTypingBubble({ guideName }: { readonly guideName: string }) {
  const styles = useStyles();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 4 }}
      accessible
      accessibilityLabel={t({ id: 'chat.premium.guideTyping', message: `${guideName} is writing` })}
      testID="chat-guide-typing"
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <CritterSticker kind="gecko" name={guideName} size={28} edge={false} pose="think" />
      </View>
      <View style={styles.typing}>
        {[0.35, 0.6, 0.85].map((opacity) => (
          <View key={opacity} style={[styles.typingDot, { opacity }]} />
        ))}
      </View>
    </View>
  );
}

export interface Starter {
  readonly key: string;
  readonly doodle: DoodleName;
  readonly color: string;
  readonly label: string;
  readonly onPress: () => void;
}

/** A brand-new chat (5.02): the crew around the guide, who made it, the guide's hello and starters. */
export function ChatWelcome({
  crewName,
  madeBy,
  members,
  guideName,
  starters,
}: {
  readonly crewName: string;
  readonly madeBy: string | null;
  readonly members: readonly { readonly name: string; readonly color: string }[];
  readonly guideName: string;
  readonly starters: readonly Starter[];
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const ring = members.slice(0, 6);
  return (
    <View style={{ gap: th.space.gap16, paddingTop: th.space.gap16 }} testID="chat-welcome">
      <View style={{ alignSelf: 'center', width: 200, height: 110 }}>
        {ring.map((member, index) => {
          const angle = (Math.PI * 2 * index) / Math.max(ring.length, 1) - Math.PI / 2;
          return (
            <View
              key={`${member.name}-${index}`}
              style={{
                position: 'absolute',
                left: 80 + Math.cos(angle) * 80,
                top: 35 + Math.sin(angle) * 40,
              }}
            >
              <Avatar name={member.name} color={member.color} size={40} ringed />
            </View>
          );
        })}
        <View style={{ position: 'absolute', left: 68, top: 23 }}>
          <CritterSticker kind="gecko" name={guideName} size={64} pose="cheer" />
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: th.space.gap4 }}>
        <Text variant="title" align="center">
          {t({ id: 'chat.premium.welcome.title', message: `${crewName} is on` })}
        </Text>
        {madeBy === null ? null : (
          <Text variant="label" tone="muted" style={{ fontWeight: '400' }}>
            {t({ id: 'chat.premium.welcome.madeBy', message: `${madeBy} made the crew` })}
          </Text>
        )}
      </View>
      <View
        style={{
          maxWidth: 258,
          backgroundColor: th.color.card,
          borderRadius: th.radius.banner,
          borderBottomLeftRadius: 6,
          paddingVertical: 9,
          paddingHorizontal: 14,
        }}
      >
        <Text variant="guideName" tone="guideName">
          {guideName}
        </Text>
        <Text variant="body">
          {t({
            id: 'chat.premium.welcome.hello',
            message:
              "Hi all! I'm your guide in here. Mention me with @ and I'll pitch in. Where to start?",
          })}
        </Text>
      </View>
      <View style={{ gap: th.space.gap8 }}>
        {starters.map((starter) => (
          <PressableScale
            key={starter.key}
            style={styles.starter}
            onPress={starter.onPress}
            accessibilityRole="button"
            testID={`chat-starter-${starter.key}`}
          >
            <Doodle name={starter.doodle} color={starter.color} size={28} />
            <Text variant="rowTitle" style={{ fontSize: 14.5 }}>
              {starter.label}
            </Text>
          </PressableScale>
        ))}
      </View>
      <Text variant="caption" tone="placeholder" align="center">
        {t({
          id: 'chat.premium.welcome.footnote',
          message: "Messages stay on everyone's phone, offline too",
        })}
      </Text>
    </View>
  );
}
