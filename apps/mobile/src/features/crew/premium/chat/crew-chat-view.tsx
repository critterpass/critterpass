/**
 * The premium crew chat's container: reads the chat through its hooks and draws the header, the
 * timeline, the composer and its tray, and what opens over them. Nothing typed is lost: a failed
 * send keeps its text, a reply or edit strip stays until sent or cancelled.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionUid } from '@/data/powersync/use-session-uid';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { usePremiumTheme } from '@/ui/premium';

import { critterRoute } from '@/features/critters';
import { crewInviteRoute } from '../../crews-sheet/routes';
import { buildTimelineRows } from '../../chat/components/timeline-rows';
import type { ChatMessage } from '../../chat/data/rows';
import { useChatInfo } from '../../chat/data/use-chat-info';
import { useGuideReplying } from '../../chat/data/use-guide-replying';
import { useMessages } from '../../chat/data/use-messages';
import { usePins } from '../../chat/data/use-pins';
import { useReactions } from '../../chat/data/use-reactions';
import { useReadReceipts } from '../../chat/data/use-read-receipts';
import { useStickerTray } from '../../chat/data/use-sticker-tray';
import { firstName, useChatTyping } from '../../chat/data/use-typing';
import { useMarkRead } from '../../chat/data/use-unread-count';
import { useChatMediaActions } from '../../chat/media/use-chat-media-actions';
import { crewAccent } from '../crew-colour';
import { ChatBottom } from './chat-bottom';
import { OfflineMarker } from './chat-chips';
import { CHAT_HEADER_HEIGHT, ChatHeader, type HeaderLine } from './chat-header';
import { ChatOverlays, type ChatOverlay } from './chat-overlays';
import { ChatWelcome, GuideTypingBubble } from './chat-panels';
import { chatStarters } from './chat-starters';
import './cards/register';
import { PremiumMessageList } from './message-list';
import type { MessageRowHandlers } from './message-row';
import { useChatDraft } from './use-chat-draft';
import { useChatMenu } from './use-chat-menu';
import { useLeftChat } from './use-left-chat';
import { useRenderRow } from './use-render-row';

const NO_GROUPS = [] as const;

export function CrewChatView({ crewId }: { readonly crewId: string }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const me = useSessionUid();
  const info = useChatInfo(crewId, me);
  const timeline = useMessages(crewId, me);
  const composer = useChatDraft(crewId, info.guide?.name ?? null);
  const { draft, setDraft, replyTo, editing, retry, discard, actions } = composer;
  const markSeen = useMarkRead(crewId, info.lastReadSeq);
  const offline = useSyncPhase() === 'offline';
  const reactions = useReactions(crewId, me, timeline.window);
  const pins = usePins(crewId);
  const readBy = useReadReceipts(crewId, me);
  const left = useLeftChat(crewId);
  const tray = useStickerTray(me);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [overlay, setOverlay] = useState<ChatOverlay>(null);
  const media = useChatMediaActions(crewId, {
    replyTo: replyTo?.id ?? null,
    onQueued: composer.clearReply,
  });

  const colourOf = useCallback(
    (uid: string | null) => {
      const index = info.members.findIndex((member) => member.uid === uid);
      return crewAccent(info.members[index]?.colour, index);
    },
    [info.members],
  );
  const namesByUid = useMemo(
    () => new Map(info.members.map((member) => [member.uid, member.name])),
    [info.members],
  );
  const typing = useChatTyping(crewId, namesByUid);
  const guideName = info.guide?.name ?? 'Tokek';
  const guideReplying = useGuideReplying(timeline.messages, info.guide !== null, timeline.loaded);
  const former = info.myStatus === 'former';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows = useMemo(
    () =>
      me === null
        ? []
        : buildTimelineRows(timeline.messages, {
            me,
            lastReadSeq: info.lastReadSeq,
            timeZone: zone,
          }),
    [timeline.messages, me, info.lastReadSeq, zone],
  );
  const isMine = useCallback(
    (message: ChatMessage) => message.senderKind === 'user' && message.senderId === me,
    [me],
  );
  const toggleReaction = reactions.toggle;
  const handlers = useMemo<MessageRowHandlers>(
    () => ({
      onLongPress: (message, anchor) => {
        Keyboard.dismiss();
        setOverlay({ kind: 'menu', message, anchor });
      },
      onRetry: (message) => void retry(message),
      onDiscard: (message) => void discard(message),
      onToggleReaction: (messageId, reaction) => void toggleReaction(messageId, reaction),
      onShowReactions: (message) => setOverlay({ kind: 'who', message }),
    }),
    [retry, discard, toggleReaction],
  );
  const renderRow = useRenderRow({
    messages: timeline.messages,
    openedSeq: timeline.openedSeq,
    isMine,
    colourOf,
    guideName,
    readBy,
    readOnly: former,
    groups: reactions.groups,
    handlers,
  });

  const toggleTray = () => {
    if (trayOpen) {
      setTrayOpen(false);
      input.current?.focus();
    } else {
      Keyboard.dismiss();
      setTrayOpen(true);
    }
  };

  const menuFor = useChatMenu({
    me,
    input,
    isPinned: pins.isPinned,
    setPinned: pins.setPinned,
    metForm: (formId) => tray.tabs.some((tab) => tab.form.formId === formId),
    hasReactions: (messageId) => (reactions.groups.get(messageId) ?? []).length > 0,
    remove: actions.remove,
    setReplyTo: composer.setReplyTo,
    setEditing: composer.setEditing,
    setDraft,
    openTray: () => setTrayOpen(true),
    setOverlay,
  });

  const headerLine: HeaderLine = offline
    ? { kind: 'offline' }
    : former
      ? { kind: 'readOnly', leftOn: null }
      : typing.names.length > 0
        ? { kind: 'typing', names: typing.names }
        : { kind: 'people', count: info.members.length, guideName: info.guide?.name ?? null };
  const empty =
    timeline.loaded &&
    media.uploads.length === 0 &&
    timeline.messages.every((message) => message.senderKind === 'system');
  const placeholder = offline
    ? t({ id: 'chat.premium.placeholder.offline', message: 'Sends when you’re back' })
    : empty
      ? t({ id: 'chat.premium.placeholder.new', message: 'Say hi to the crew' })
      : t({ id: 'chat.premium.placeholder', message: 'Message, or @tokek' });
  const top = insets.top + CHAT_HEADER_HEIGHT;

  const list =
    empty && !former ? (
      <View style={{ flex: 1, paddingTop: top, paddingHorizontal: th.space.gap16 }}>
        <ChatWelcome
          crewName={info.crewName ?? ''}
          madeBy={firstName(info.members[0]?.name)}
          members={info.members.map((member, index) => ({
            name: member.name ?? '',
            color: crewAccent(member.colour, index),
          }))}
          guideName={guideName}
          starters={chatStarters(
            th,
            setDraft,
            info.members.length === 1 ? () => router.push(crewInviteRoute(crewId)) : null,
          )}
        />
      </View>
    ) : (
      <PremiumMessageList
        rows={rows}
        renderRow={renderRow}
        isMine={isMine}
        topInset={top + th.space.gap4}
        bottomInset={th.space.gap8}
        footer={
          <>
            {offline && timeline.messages.some((message) => message.status === 'sending') ? (
              <OfflineMarker />
            ) : null}
            {guideReplying ? <GuideTypingBubble guideName={guideName} /> : null}
          </>
        }
        onLoadOlder={timeline.loadOlder}
        onSeenLatest={markSeen}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="chat-screen">
      <ChatBottom
        list={list}
        former={former}
        crewName={info.crewName ?? ''}
        onRejoin={left.onRejoin}
        onRemove={left.onRemove}
        inputRef={input}
        composer={{
          value: draft,
          onChangeText: (text) => {
            setDraft(text);
            typing.notifyTyping();
          },
          placeholder,
          canSend: draft.trim() !== '',
          onSend: composer.submit,
          trayOpen,
          onToggleTray: toggleTray,
          onFocus: () => setTrayOpen(false),
          ...(media.available
            ? {
                onAdd: media.menu.show,
                onMicTap: media.recorder.onMicTap,
                onMicHoldStart: media.recorder.onHoldStart,
                onMicHoldEnd: media.recorder.onHoldEnd,
              }
            : {}),
          recording: media.recorder.state === 'holding' || media.recorder.state === 'locked',
          recorder: media.recorder,
          replyTo,
          editing,
          onCancelStrip: composer.cancelStrip,
        }}
        tray={tray}
        onSendSticker={(sticker) => composer.sendSticker(sticker.form.formId, sticker.pose)}
        onLockedSticker={(critterId) => router.push(critterRoute(critterId))}
      />
      <ChatHeader crewId={crewId} crewName={info.crewName} line={headerLine} />
      <ChatOverlays
        crewId={crewId}
        overlay={overlay}
        close={() => setOverlay(null)}
        isMine={isMine}
        groupsOf={(messageId) => reactions.groups.get(messageId) ?? NO_GROUPS}
        colourOf={colourOf}
        menuFor={menuFor}
        onReact={(messageId, reaction) => void toggleReaction(messageId, reaction)}
        onReport={(message, reason, mute) => {
          void actions.report(message, reason);
          if (mute && message.senderId !== null) void actions.mute(message.senderId, true);
        }}
        media={media}
        onTypeInstead={() => input.current?.focus()}
      />
    </View>
  );
}
