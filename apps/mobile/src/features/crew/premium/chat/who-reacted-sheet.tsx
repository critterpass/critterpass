/**
 * Two small sheets over the chat: who reacted to a message, each face with the critter or doodle
 * they reacted with (5.01, 5.09), and reporting a crewmate's message with a reason (5.04), which
 * can mute them at the same time.
 */
import { REPORT_REASONS, type ReportReason } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Checkbox, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { reasonLabel } from '../../chat/components/report-reasons';
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
  const rows = groups.flatMap((group) =>
    group.users.map((user) => ({ ...user, reaction: group.emoji })),
  );
  return (
    <ChatSheet onClose={onClose} testID="chat-who-reacted">
      <Text variant="title" style={{ paddingVertical: th.space.gap12 }}>
        {t({ id: 'chat.premium.who.title', message: 'Reactions' })}
      </Text>
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
    </ChatSheet>
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
          onPress={() => setReason(value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: reason === value }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: th.space.gap12,
            paddingVertical: th.space.gap10,
          }}
          testID={`chat-report-${value}`}
        >
          <Checkbox
            checked={reason === value}
            accessibilityLabel={reasonLabel(value)}
            onChange={() => setReason(value)}
          />
          <Text variant="rowText">{reasonLabel(value)}</Text>
        </PressableScale>
      ))}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: th.space.gap12,
          paddingVertical: th.space.gap8,
        }}
      >
        <Checkbox
          checked={mute}
          accessibilityLabel={t({
            id: 'chat.premium.report.mute',
            message: `Also mute ${senderName}`,
          })}
          onChange={setMute}
        />
        <Text variant="rowText">
          {t({ id: 'chat.premium.report.mute', message: `Also mute ${senderName}` })}
        </Text>
      </View>
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
