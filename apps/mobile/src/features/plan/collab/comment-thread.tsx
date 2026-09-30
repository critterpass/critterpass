/**
 * Anchored comments (3g-2; the item sheet's thread too): "ON: KELINGKING VIEWPOINT", each comment
 * with its author, "+1 from Rin · 4m" (tap to add or take back your own +1; never on your own),
 * the guide's reply writing itself in with KEEP IT / UNDO while its change can still be undone,
 * and who is typing, with the typing dots.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { format, upper } from '@cp/i18n';

import { useTypewriter } from '@/motion/patterns/typewriter';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TypingDots } from '@/ui/chat/TypingDots';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PlanMember } from '../day/use-trip-plan';
import type { ThreadComment } from './decision-model';

const GUIDE_STICKER = 40;

const useStyles = makeStyles((th) => ({
  panel: {
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
    padding: th.space['16'],
    gap: th.space['12'],
  },
  body: { flex: 1, gap: th.space['4'] },
}));

/** "4m", "2h", "3d" since a moment, in the reader's locale. */
export function ago(locale: string, at: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  const [value, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 1440
        ? [Math.round(minutes / 60), 'hour']
        : [Math.round(minutes / 1440), 'day'];
  return format.number(locale, value, { style: 'unit', unit, unitDisplay: 'narrow' });
}

function GuideReplyBlock({
  text,
  guide,
  kept,
  onKeep,
  onUndo,
}: {
  readonly text: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly kept: boolean;
  readonly onKeep: () => void;
  readonly onUndo: () => void;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  const typed = useTypewriter({ text });
  return (
    <Stack gap="8">
      <Row gap="10" align="flex-start">
        <Sticker kind={guide.kind} name={guide.name} size={GUIDE_STICKER} pose="point" />
        <Text
          variant="voice"
          color={theme.color.yellow}
          style={{ flex: 1 }}
          accessibilityLabel={typed.fullText}
        >
          {typed.visibleText}
        </Text>
      </Row>
      {kept ? null : (
        <Row gap="8" style={{ paddingStart: GUIDE_STICKER + theme.space['10'] }}>
          <PillButton
            size="sm"
            tone="yellow"
            label={t({ id: 'plan.collab.keep', message: 'Keep it' })}
            onPress={onKeep}
            testID="plan-guide-keep"
          />
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'plan.collab.undo', message: 'Undo' })}
            onPress={onUndo}
            testID="plan-guide-undo"
          />
        </Row>
      )}
    </Stack>
  );
}

export function CommentThread({
  title,
  comments,
  members,
  uid,
  typing,
  guide,
  kept,
  now,
  onPlusOne,
  onKeep,
  onUndo,
}: {
  /** What the thread is on ("Kelingking viewpoint"). */
  readonly title: string;
  readonly comments: readonly ThreadComment[];
  readonly members: readonly PlanMember[];
  readonly uid: string | null;
  /** Uids typing now. */
  readonly typing: readonly string[];
  readonly guide: { readonly kind: string; readonly name: string };
  readonly kept: ReadonlySet<string>;
  readonly now: number;
  readonly onPlusOne: (commentId: string, on: boolean) => void;
  readonly onKeep: (actionId: string) => void;
  readonly onUndo: (actionId: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const member = (id: string) => members.find((candidate) => candidate.uid === id);
  const nameOf = (id: string) => member(id)?.name ?? '';
  const typists = typing.map(nameOf).filter((name) => name !== '');
  return (
    <View style={styles.panel} testID="plan-comments">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'plan.collab.on', message: `On: ${title}` }), locale)}
      </Text>
      {comments.length === 0 ? (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.collab.noComments', message: 'No comments yet. Say what you think.' })}
        </Text>
      ) : null}
      {comments.map((comment) => {
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
          <Stack key={comment.id} gap="8" testID={`plan-comment-${comment.id}`}>
            <Row gap="10" align="flex-start">
              <Avatar name={author?.name ?? ''} joinIndex={author?.joinIndex ?? 0} size="sm" />
              <View style={styles.body}>
                <Text
                  variant="body"
                  color={
                    comment.deleted ? theme.semantic.text.secondary : theme.semantic.text.primary
                  }
                >
                  <Text variant="rowTitle">{`${author?.name ?? ''} `}</Text>
                  {comment.deleted
                    ? t({ id: 'plan.collab.deleted', message: 'Comment deleted' })
                    : comment.body}
                </Text>
                {plusLine !== null || (!mine && !comment.deleted) ? (
                  <PressScale
                    widthClass="narrow"
                    disabled={mine || comment.deleted}
                    onPress={() => onPlusOne(comment.id, !plusOned)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      plusOned
                        ? t({ id: 'plan.collab.unPlusOne', message: 'Take back your +1' })
                        : t({ id: 'plan.collab.plusOne', message: '+1 this' })
                    }
                    accessibilityState={{ selected: plusOned }}
                    testID={`plan-comment-plus-${comment.id}`}
                  >
                    <Text
                      variant="bodySm"
                      color={plusOned ? theme.color.yellow : theme.semantic.text.secondary}
                    >
                      {plusLine ?? t({ id: 'plan.collab.plusOneAction', message: '+1' })}
                    </Text>
                  </PressScale>
                ) : null}
              </View>
            </Row>
            {comment.guide === null ? null : (
              <GuideReplyBlock
                text={comment.guide.text}
                guide={guide}
                kept={kept.has(comment.guide.actionId)}
                onKeep={() => comment.guide !== null && onKeep(comment.guide.actionId)}
                onUndo={() => comment.guide !== null && onUndo(comment.guide.actionId)}
              />
            )}
          </Stack>
        );
      })}
      {typists.length === 0 ? null : (
        <Row gap="8" align="center" accessibilityLiveRegion="polite" testID="plan-typing">
          <Avatar
            name={typists[0] ?? ''}
            joinIndex={member(typing[0] ?? '')?.joinIndex ?? 0}
            size="sm"
          />
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {typists.length === 1
              ? t({ id: 'plan.collab.typingOne', message: `${typists[0] ?? ''} is typing` })
              : t({
                  id: 'plan.collab.typingMany',
                  message: `${format.list(locale, typists)} are typing`,
                })}
          </Text>
          <TypingDots />
        </Row>
      )}
    </View>
  );
}
