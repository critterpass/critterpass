/**
 * A stop's comments in the premium stop sheet: "On: {stop}", each comment with its author's face
 * and "+1 from Rin · 4m" (tap to add or take back your own +1, never on your own), the guide's
 * reply writing itself in with Keep it / Undo while it can still be undone, who is typing, and a
 * one-line composer that queues the comment. Reads, +1s and the queue are the current thread's.
 */
import type { CommentTarget } from '@cp/domain';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useTyping } from '@/data/realtime/use-typing';
import { crewColour } from '@/features/vote';
import { useLocale } from '@/lib/i18n/use-locale';
import { useTypewriter } from '@/motion/patterns/typewriter';
import {
  Avatar,
  Button,
  Card,
  CritterSticker,
  PressableScale,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import { ago } from '../../collab/ago';
import type { Anchor } from '../../collab/decision-model';
import type { ItemCommentsProps } from '../../day/item-sheet-look';
import { useComments } from '../../collab/use-comments';
import { PRESENCE_NAMESPACE } from '../../collab/use-presence';

function GuideReply(props: {
  readonly text: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly kept: boolean;
  readonly onKeep: () => void;
  readonly onUndo: () => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const typed = useTypewriter({ text: props.text });
  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: theme.color.banner.guide.bg,
        padding: theme.space.gap10,
        gap: theme.space.gap8,
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.space.gap8, alignItems: 'flex-start' }}>
        <CritterSticker kind={props.guide.kind} name={props.guide.name} size={32} />
        <Text
          variant="caption"
          color={theme.color.banner.guide.text}
          style={{ flex: 1 }}
          accessibilityLabel={typed.fullText}
        >
          {typed.visibleText}
        </Text>
      </View>
      {props.kept ? null : (
        <View style={{ flexDirection: 'row', gap: theme.space.gap6 }}>
          <Button
            size="small"
            label={t({ id: 'plan.collab.keep', message: 'Keep it' })}
            onPress={props.onKeep}
            testID="plan-guide-keep"
          />
          <Button
            size="small"
            variant="control"
            label={t({ id: 'plan.collab.undo', message: 'Undo' })}
            onPress={props.onUndo}
            testID="plan-guide-undo"
          />
        </View>
      )}
    </View>
  );
}

export function PremiumItemComments({ item, ...rest }: ItemCommentsProps) {
  const anchor = { kind: 'item', id: item.stableId } as const;
  return <PremiumCommentsCard {...rest} title={item.title} anchors={[anchor]} target={anchor} />;
}

export interface PremiumCommentsCardProps {
  readonly tripId: string;
  readonly uid: string | null;
  readonly members: ItemCommentsProps['members'];
  readonly guide: { readonly kind: string; readonly name: string };
  /** What the thread is on ("Kelingking viewpoint"). */
  readonly title: string;
  /** The comments shown: on the stop, or on a vote's option and its place. */
  readonly anchors: readonly Anchor[];
  /** Where a new comment goes. */
  readonly target: CommentTarget;
}

/** One thread as a card: the stop sheet's comments, and a live decision's on its option. */
export function PremiumCommentsCard(props: PremiumCommentsCardProps) {
  const { tripId, uid, members, guide, title } = props;
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const comments = useComments(tripId, uid);
  const typing = useTyping(PRESENCE_NAMESPACE, tripId);
  const [draft, setDraft] = useState('');
  const now = comments.now;
  const thread = comments.thread(props.anchors);
  const member = (id: string) => members.find((candidate) => candidate.uid === id);
  const nameOf = (id: string) => member(id)?.name ?? '';
  const typists = typing.typing.map(nameOf).filter((name) => name !== '');
  const send = () => {
    const body = draft;
    setDraft('');
    void comments.addComment(props.target, body);
  };
  return (
    <Card padded testID="plan-comments">
      <View style={{ gap: theme.space.gap10 }}>
        <Text variant="badge" tone="muted">
          {upper(t({ id: 'plan.collab.on', message: `On: ${title}` }), locale)}
        </Text>
        {thread.length === 0 ? (
          <Text variant="caption" tone="muted">
            {t({ id: 'plan.collab.noComments', message: 'No comments yet. Say what you think.' })}
          </Text>
        ) : null}
        {thread.map((comment) => {
          const author = member(comment.authorId);
          const mine = comment.authorId === uid;
          const plusOned = uid !== null && comment.plusOnes.includes(uid);
          const others = comment.plusOnes.filter((id) => id !== uid).map(nameOf);
          const plusLine =
            comment.plusOnes.length === 0
              ? null
              : t({
                  id: 'plan.collab.plusOnes',
                  message: `+1 from ${format.list(locale, plusOned ? [t({ id: 'plan.collab.you', message: 'you' }), ...others] : others)} · ${ago(locale, comment.createdAt, now)}`,
                });
          return (
            <View
              key={comment.id}
              style={{ gap: theme.space.gap6 }}
              testID={`plan-comment-${comment.id}`}
            >
              <View
                style={{ flexDirection: 'row', gap: theme.space.gap10, alignItems: 'flex-start' }}
              >
                <Avatar
                  name={author?.name ?? ''}
                  color={crewColour(author?.joinIndex ?? 0)}
                  uid={comment.authorId}
                  size={28}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="rowTextStrong">{author?.name ?? ''}</Text>
                  <Text variant="body" tone={comment.deleted ? 'muted' : 'ink'}>
                    {comment.deleted
                      ? t({ id: 'plan.collab.deleted', message: 'Comment deleted' })
                      : comment.body}
                  </Text>
                  {plusLine !== null || (!mine && !comment.deleted) ? (
                    <PressableScale
                      disabled={mine || comment.deleted}
                      onPress={() => void comments.plusOne(comment.id, !plusOned)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        plusOned
                          ? t({ id: 'plan.collab.unPlusOne', message: 'Take back your +1' })
                          : t({ id: 'plan.collab.plusOne', message: '+1 this' })
                      }
                      accessibilityState={{ selected: plusOned }}
                      testID={`plan-comment-plus-${comment.id}`}
                    >
                      <Text variant="captionMuted" tone={plusOned ? 'ink' : 'muted'}>
                        {plusLine ?? t({ id: 'plan.collab.plusOneAction', message: '+1' })}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
              </View>
              {comment.guide === null ? null : (
                <GuideReply
                  text={comment.guide.text}
                  guide={guide}
                  kept={comments.kept.has(comment.guide.actionId)}
                  onKeep={() => comment.guide !== null && comments.keep(comment.guide.actionId)}
                  onUndo={() =>
                    comment.guide !== null && void comments.undo(comment.guide.actionId)
                  }
                />
              )}
            </View>
          );
        })}
        {typists.length === 0 ? null : (
          <Text
            variant="captionMuted"
            tone="muted"
            accessibilityLiveRegion="polite"
            testID="plan-typing"
          >
            {typists.length === 1
              ? t({ id: 'plan.collab.typingOne', message: `${typists[0] ?? ''} is typing` })
              : t({
                  id: 'plan.collab.typingMany',
                  message: `${format.list(locale, typists)} are typing`,
                })}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
          <View style={{ flex: 1 }}>
            <TextField
              accessibilityLabel={t({ id: 'plan.collab.itemComposer', message: 'Add a comment' })}
              placeholder={t({ id: 'plan.collab.itemComposer', message: 'Add a comment' })}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                typing.notifyTyping();
              }}
              onSubmitEditing={send}
              returnKeyType="send"
              testID="plan-item-comment-field"
            />
          </View>
          <Button
            size="small"
            label={t({ id: 'plan.collab.send', message: 'Send' })}
            disabled={draft.trim() === ''}
            onPress={send}
            testID="plan-item-comment-send"
          />
        </View>
      </View>
    </Card>
  );
}
