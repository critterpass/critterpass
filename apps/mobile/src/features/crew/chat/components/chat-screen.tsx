/**
 * The crew chat (3g-1): header, the offline banner, the timeline read from the local database with
 * its skeleton, empty and former-member states, who is typing, and the composer. Messages written
 * offline show at once and send when the phone is back; the read marker follows the member to the
 * bottom of the timeline.
 */
import { router, useLocalSearchParams } from 'expo-router';
import {
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { KeyboardFooter } from '@/ui';
import { SessionWaiting } from '@/ui/states/SessionWaiting';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';
import { guideColour } from '@/ui/avatar/guides';

import type { ChatMessage } from '../data/rows';
import { useChatInfo } from '../data/use-chat-info';
import { useMessages } from '../data/use-messages';
import { useMessageActions } from '../data/use-message-actions';
import { useReactions } from '../data/use-reactions';
import { useSendMessage } from '../data/use-send-message';
import '../media/register';
import { useMediaControls } from '../media/use-media-controls';
import { voicePlayback } from '../media/voice-playback';
import { crewInviteRoute } from '../../crews-sheet/routes';
import { firstName, useChatTyping } from '../data/use-typing';
import { useMarkRead } from '../data/use-unread-count';
import { chatComposerHint } from '../slots';
import { ReplyQuote } from '../cards/reply-quote';
import { ChatOverlays, type ChatOverlay } from './chat-overlays';
import { ChatHeader } from './chat-header';
import { ChatComposer, FormerMemberBar, type ChatComposerHandle } from './composer';
import { buildTimelineRows, dayKey, type TimelineRow } from './timeline-rows';
import { ChatStart } from './chat-start';
import { EmptyChat, guideIdOf } from './empty-chat';
import type { MentionCandidate } from './mention-picker';
import { MessageList } from './message-list';
import { MessageRow, NO_REACTIONS, type MessageRowHandlers } from './message-row';
import { OfflineBanner } from './offline-banner';
import { ChatSkeleton } from './skeleton';
import { TypingRow, useGuideReplying } from './typing-dots';

const useStyles = makeStyles(() => ({ root: { flex: 1 } }));

function viewerZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function ChatScreen() {
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  // A cold start can restore the chat before the session's local database is open.
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="chat-waiting" />;
  return <CrewChat crewId={crewId} />;
}

/**
 * Nothing to read yet: only system rows, and no photo or voice note of this device on its way up
 * (an upload in flight, or one that was refused, is content: it shows its progress and its Retry).
 */
export function chatIsEmpty(messages: readonly ChatMessage[], pendingUploads: number): boolean {
  return pendingUploads === 0 && messages.every((message) => message.senderKind === 'system');
}

export function CrewChat({ crewId }: { readonly crewId: string }) {
  const styles = useStyles();
  const me = useSessionUid();
  const info = useChatInfo(crewId, me);
  const timeline = useMessages(crewId, me);
  const { send, retry, discard } = useSendMessage(crewId);
  const markSeen = useMarkRead(crewId, info.lastReadSeq);
  const syncPhase = useSyncPhase();
  const composer = useRef<ChatComposerHandle>(null);
  const reactions = useReactions(crewId, me, timeline.window);
  const { edit } = useMessageActions(crewId);
  const [overlay, setOverlay] = useState<ChatOverlay>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const clearReply = useCallback(() => setReplyTo(null), []);
  const mediaControls = useMediaControls(crewId, syncPhase !== 'offline', {
    replyTo: replyTo?.id ?? null,
    onQueued: clearReply,
  });
  // A note still playing stops with the chat.
  useEffect(() => () => voicePlayback.stop(), []);
  const byId = useMemo(
    () => new Map(timeline.messages.map((message) => [message.id, message])),
    [timeline.messages],
  );
  // Messages newer than the first read rise in; the ones already there when it opened do not.
  const openedAt = timeline.openedSeq;

  const namesByUid = useMemo(
    () => new Map(info.members.map((member) => [member.uid, member.name])),
    [info.members],
  );
  const joinIndex = useMemo(
    () => new Map(info.members.map((member, index) => [member.uid, index])),
    [info.members],
  );
  const typing = useChatTyping(crewId, namesByUid);
  const former = info.myStatus === 'former';
  const guideName = info.guide?.name ?? null;
  const guideColor = info.guide?.colour ?? guideColour(guideIdOf(info.guide?.slug));
  const candidates = useMemo<MentionCandidate[]>(
    () => [
      ...(info.guide === null
        ? []
        : [{ kind: 'guide' as const, id: info.guide.id, name: info.guide.name, joinIndex: 0 }]),
      ...info.members.flatMap((member, index) => {
        const name = firstName(member.name);
        return member.uid === me || name === null
          ? []
          : [{ kind: 'member' as const, id: member.uid, name, joinIndex: index }];
      }),
    ],
    [info.guide, info.members, me],
  );

  const zone = viewerZone();
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
  const today = dayKey(new Date().toISOString(), zone);
  const waiting = timeline.messages.filter((message) => message.status === 'sending').length;
  const Hint = chatComposerHint();

  const guideReplying = useGuideReplying(timeline.messages, info.guide !== null, timeline.loaded);

  // One set of handlers for every row, the same on every render: a row is drawn again only when
  // its own message changes.
  const toggleReaction = reactions.toggle;
  const handlers = useMemo<MessageRowHandlers>(
    () => ({
      onRetry: (message) => void retry(message),
      onDiscard: (message) => void discard(message),
      onActions: (message) => setOverlay({ kind: 'actions', message }),
      onReply: setReplyTo,
      onToggleReaction: (messageId, emoji) => void toggleReaction(messageId, emoji),
      onShowReactions: (message) => setOverlay({ kind: 'reactions', message }),
    }),
    [retry, discard, toggleReaction],
  );
  const groups = reactions.groups;
  const renderMessage = useCallback(
    ({ message, first, last }: Extract<TimelineRow, { kind: 'message' }>) => (
      <MessageRow
        message={message}
        mine={message.senderKind === 'user' && message.senderId === me}
        first={first}
        last={last}
        joinIndex={joinIndex.get(message.senderId ?? '') ?? -1}
        guideColor={guideColor}
        animate={openedAt !== null && (message.seq === null || message.seq > openedAt)}
        readOnly={former}
        repliedTo={message.replyToId === null ? undefined : byId.get(message.replyToId)}
        reactions={groups.get(message.id) ?? NO_REACTIONS}
        handlers={handlers}
      />
    ),
    [me, joinIndex, guideColor, openedAt, former, byId, groups, handlers],
  );
  const lone = info.loaded && info.members.length === 1 && !former;
  const footer = useMemo(
    () => (
      <>
        {mediaControls.uploads}
        <TypingRow names={typing.names} guideTyping={guideReplying} guideColor={guideColor} />
      </>
    ),
    [mediaControls.uploads, typing.names, guideReplying, guideColor],
  );
  const header = useMemo(
    () =>
      timeline.hasOlder ? null : (
        <ChatStart guideSlug={info.guide?.slug ?? null} crewName={info.crewName} />
      ),
    [timeline.hasOlder, info.guide?.slug, info.crewName],
  );

  return (
    <>
      <Scaffold variant="dark" edges={['top']} testID="chat-screen">
        <View style={styles.root}>
          <ChatHeader
            crewId={crewId}
            crewName={info.crewName}
            people={info.members.length}
            guideName={guideName}
          />
          {syncPhase === 'offline' ? <OfflineBanner waiting={waiting} /> : null}
          <View style={styles.root}>
            {!timeline.loaded || me === null ? (
              <ChatSkeleton />
            ) : chatIsEmpty(timeline.messages, mediaControls.pending) && !former ? (
              <EmptyChat
                guideSlug={info.guide?.slug ?? null}
                guideName={guideName ?? 'Tokek'}
                onSayHi={() => composer.current?.prefill('👋 ')}
                {...(lone ? { onInvite: () => router.push(crewInviteRoute(crewId)) } : {})}
              />
            ) : (
              <MessageList
                rows={rows}
                today={today}
                renderMessage={renderMessage}
                header={header}
                footer={footer}
                onLoadOlder={timeline.loadOlder}
                onSeenLatest={markSeen}
              />
            )}
          </View>
          {/* The composer rides the keyboard on both platforms and pads the home indicator itself. */}
          <KeyboardFooter inset="none" testID="chat-footer">
            {former ? (
              <FormerMemberBar />
            ) : (
              <>
                {Hint === null ? null : createElement(Hint, { crewId })}
                {mediaControls.bar}
                <ChatComposer
                  ref={composer}
                  candidates={candidates}
                  guideName={guideName}
                  onSend={(draft) => {
                    void send(draft);
                    setReplyTo(null);
                  }}
                  onTyping={typing.notifyTyping}
                  {...mediaControls.composer}
                  {...(replyTo === null
                    ? {}
                    : {
                        replyTo: {
                          id: replyTo.id,
                          preview: <ReplyQuote message={replyTo} />,
                          onCancel: clearReply,
                        },
                      })}
                  {...(editing === null
                    ? {}
                    : { editing: { id: editing.id, onCancel: () => setEditing(null) } })}
                  onEdit={(messageId, body) => {
                    const message = byId.get(messageId);
                    if (message !== undefined) void edit(message, body);
                  }}
                />
              </>
            )}
          </KeyboardFooter>
        </View>
      </Scaffold>
      {/* Beside the screen root, not inside it: the root scales as the sheet's presenter while the
          sheet stays full-bleed over it. */}
      {mediaControls.sheet}
      {me === null ? null : (
        <ChatOverlays
          crewId={crewId}
          me={me}
          overlay={overlay}
          setOverlay={setOverlay}
          reactions={reactions.groups}
          joinIndex={joinIndex}
          onReact={(messageId, emoji) => void reactions.toggle(messageId, emoji)}
          onReply={setReplyTo}
          onEdit={(message) => {
            setEditing(message);
            composer.current?.prefill(message.body);
          }}
        />
      )}
    </>
  );
}
