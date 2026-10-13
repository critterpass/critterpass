/**
 * Two small sheets over the chat: who reacted to a message, each face with the critter or doodle
 * they reacted with (5.01, 5.09), and reporting a crewmate's message with a reason (5.04), which
 * can mute them at the same time.
 */
import { REPORT_REASONS, type ReportReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import {
  Avatar,
  Button,
  Icon,
  PressableScale,
  Text,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';

import { reasonLabel } from '../../chat/components/report-reasons';
import type { ChatMessage } from '../../chat/data/rows';
import type { useMessageActions } from '../../chat/data/use-message-actions';
import type { ReactionGroup } from '../../chat/data/use-reactions';
import { ChatSheet } from './chat-sheets';
import { ReactionFace } from './reaction-chips';

export function WhoReactedSheet({
  groups,
  colourOf,
  onClose,
}: {
  readonly groups: readonly ReactionGroup[];
  readonly colourOf: (uid: string) => string;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const window = useWindowDimensions();
  const rows = groups.flatMap((group) =>
    group.users.map((user) => ({ ...user, reaction: group.emoji })),
  );
  return (
    <ChatSheet onClose={onClose} testID="chat-who-reacted">
      <Text variant="title" style={{ paddingVertical: th.space.gap12 }}>
        {t({ id: 'chat.premium.who.title', message: 'Reactions' })}
      </Text>
      <ScrollView style={{ maxHeight: window.height * 0.6 }} bounces={false}>
        {rows.map((row) => (
          <View
            key={`${row.uid}:${row.reaction}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: th.space.gap12,
              paddingVertical: th.space.gap8,
            }}
          >
            <Avatar name={row.name ?? ''} color={colourOf(row.uid)} size={32} />
            <Text variant="rowTitle" style={{ flex: 1 }}>
              {row.name ?? t({ id: 'chat.premium.who.former', message: 'Former member' })}
            </Text>
            <ReactionFace reaction={row.reaction} size={28} />
          </View>
        ))}
      </ScrollView>
    </ChatSheet>
  );
}

/** Sends a report (and the mute with it), then says it went, or that it did not. */
export function useReportMessage(
  actions: Pick<ReturnType<typeof useMessageActions>, 'report' | 'mute'>,
) {
  const toast = useToast();
  return useCallback(
    (message: ChatMessage, reason: ReportReason, mute: boolean) => {
      void actions.report(message, reason).then((result) => {
        toast.show(
          result.kind === 'rejected'
            ? {
                kind: 'error',
                message: t({
                  id: 'chat.premium.report.failed',
                  message: 'That report didn’t go through. Try again?',
                }),
              }
            : {
                kind: 'done',
                message: t({
                  id: 'chat.premium.report.done',
                  message: 'Reported. Thanks for telling us.',
                }),
              },
        );
      });
      if (mute && message.senderId !== null) void actions.mute(message.senderId, true);
    },
    [actions, toast],
  );
}

export function ReportSheet({
  senderName,
  onReport,
  onClose,
}: {
  readonly senderName: string;
  readonly onReport: (reason: ReportReason, mute: boolean) => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [mute, setMute] = useState(false);
  const name = shortName(senderName);
  const muteLabel = t({ id: 'chat.premium.report.mute', message: `Also mute ${name}` });
  return (
    <ChatSheet onClose={onClose} testID="chat-report">
      <Text variant="title" style={{ paddingTop: th.space.gap12 }}>
        {t({ id: 'chat.premium.report.title', message: 'Report this message?' })}
      </Text>
      <Text variant="caption" tone="muted" style={{ paddingBottom: th.space.gap8 }}>
        {t({
          id: 'chat.premium.report.line',
          message: 'It goes to our review team. They don’t see who reported it.',
        })}
      </Text>
      {REPORT_REASONS.map((value) => (
        <PressableScale
          key={value}
          pressedScale={1}
          onPress={() => {
            void Haptics.selectionAsync();
            setReason(value);
          }}
          accessibilityRole="radio"
          accessibilityLabel={reasonLabel(value)}
          accessibilityState={{ selected: reason === value }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: th.space.gap12,
            paddingVertical: th.space.gap10,
          }}
          testID={`chat-report-${value}`}
        >
          <RadioMark on={reason === value} />
          <Text variant="rowText">{reasonLabel(value)}</Text>
        </PressableScale>
      ))}
      <PressableScale
        pressedScale={1}
        onPress={() => {
          void Haptics.selectionAsync();
          setMute((on) => !on);
        }}
        accessibilityRole="checkbox"
        accessibilityLabel={muteLabel}
        accessibilityState={{ checked: mute }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: th.space.gap12,
          paddingVertical: th.space.gap8,
        }}
        testID="chat-report-mute"
      >
        <CheckMark on={mute} />
        <Text variant="rowText">{muteLabel}</Text>
      </PressableScale>
      <Button
        variant="destructive"
        label={t({ id: 'chat.premium.report.send', message: 'Report' })}
        disabled={reason === null}
        onPress={() => {
          if (reason === null) return;
          onReport(reason, mute);
          onClose();
        }}
        testID="chat-report-send"
      />
    </ChatSheet>
  );
}

/** A single choice's mark: a grey ring, an ink ring round an ink dot when picked. */
function RadioMark({ on }: { readonly on: boolean }) {
  const th = usePremiumTheme();
  const side = th.size.checkbox;
  return (
    <View
      style={{
        width: side,
        height: side,
        borderRadius: side / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: th.size.checkboxBorder,
        borderColor: on ? th.color.ink : th.color.outlineEmpty,
      }}
    >
      {on ? (
        <View
          style={{
            width: side / 2,
            height: side / 2,
            borderRadius: side / 4,
            backgroundColor: th.color.ink,
          }}
        />
      ) : null}
    </View>
  );
}

/** The kit checkbox's look, drawn inside a row that is itself the control. */
function CheckMark({ on }: { readonly on: boolean }) {
  const th = usePremiumTheme();
  const side = th.size.checkbox;
  return (
    <View
      style={{
        width: side,
        height: side,
        borderRadius: side / 2,
        alignItems: 'center',
        justifyContent: 'center',
        ...(on
          ? { backgroundColor: th.color.ink }
          : { borderWidth: th.size.checkboxBorder, borderColor: th.color.outlineEmpty }),
      }}
    >
      {on ? (
        <Icon name="check" size={th.size.checkboxGlyph} color={th.color.onInk} stroke={3.4} />
      ) : null}
    </View>
  );
}
