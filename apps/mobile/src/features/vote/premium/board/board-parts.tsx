/**
 * The pieces the board and the final card share: "Where next?" with the pink dot and its status
 * line, the dashed "+ Pitch a place", the empty board's ask for a first pitch, and how an online
 * command's answer is told.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import type { SendResult } from '@/data/commands/client';
import { Button, GuideNote, PressableScale, Text, makePremiumStyles, useToast } from '@/ui/premium';

import { guideSticker } from '../../format';
import { voteRoutes } from '../../routes';

const useStyles = makePremiumStyles((t) => ({
  stack: { gap: t.space.gap16 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: t.space.gap8,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap6, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent.pink },
  pitch: {
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: t.color.outlineEmpty,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface BoardHeadingProps {
  /** Hidden where the page's own title already says "Where next?". */
  readonly title: boolean;
  readonly status: string;
  readonly statusTestID: string;
}

export function BoardHeading({ title, status, statusTestID }: BoardHeadingProps) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <View style={styles.head}>
      {title ? (
        <Text variant="title" accessibilityRole="header">
          {t({ id: 'vote.premium.board.title', message: 'Where next?' })}
        </Text>
      ) : null}
      <View style={styles.status}>
        <View style={styles.dot} />
        <Text
          variant="label"
          tone="muted"
          numberOfLines={2}
          singleLine={false}
          style={{ flexShrink: 1 }}
          testID={statusTestID}
        >
          {status}
        </Text>
      </View>
    </View>
  );
}

export function PitchPill({ onPress }: { readonly onPress: () => void }) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <PressableScale
      onPress={onPress}
      style={styles.pitch}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'vote.premium.board.pitch', message: 'Pitch a place' })}
      testID="board-pitch"
    >
      <Text variant="textButton" tone="muted">
        {t({ id: 'vote.premium.board.pitchPlus', message: '+ Pitch a place' })}
      </Text>
    </PressableScale>
  );
}

export function EmptyBoard({
  crewId,
  title,
}: {
  readonly crewId: string;
  readonly title: boolean;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const tokek = guideSticker('tokek');
  return (
    <View style={styles.stack} testID="board-empty">
      {title ? (
        <Text variant="title" accessibilityRole="header">
          {t({ id: 'vote.premium.board.title', message: 'Where next?' })}
        </Text>
      ) : null}
      <GuideNote
        name={tokek.name}
        critter={tokek.kind}
        text={t({
          id: 'vote.premium.board.empty',
          message: 'The board’s empty. Pitch a place and I’ll bring the facts.',
        })}
      />
      <Button
        label={t({ id: 'vote.premium.board.pitch', message: 'Pitch a place' })}
        onPress={() => router.push(voteRoutes.pitch(crewId))}
        testID="board-pitch-cta"
      />
    </View>
  );
}

/**
 * Tells an online command's answer: a toast when it is not a yes (no signal, or the server's
 * refusal in `refused`); true when the server said yes.
 */
export function useOnlineAnswer(): (result: SendResult, refused: string) => boolean {
  const toast = useToast();
  const { t } = useLingui();
  return (result, refused) => {
    if (result.kind === 'applied' || result.kind === 'queued') return true;
    toast.show({
      kind: 'error',
      message:
        result.kind === 'unavailable'
          ? t({
              id: 'vote.premium.board.needsSignal',
              message: 'That needs signal. Try again when you’re back online.',
            })
          : refused,
    });
    return false;
  };
}
