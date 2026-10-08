/**
 * @mention autocomplete: while the word being typed starts with "@", the crew's active members
 * and the trip's guide whose first names start with what follows are offered above the composer.
 * Picking one completes the word; the send carries the picked uids (and the guide flag) for every
 * mention still in the text.
 */
import { t } from '@lingui/core/macro';

import { PressScale } from '@/ui/press/PressScale';
import { Avatar } from '@/ui/people/Avatar';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { firstName } from '../data/use-typing';

export interface MentionCandidate {
  readonly kind: 'member' | 'guide';
  /** Member uid, or the guide's id. */
  readonly id: string;
  readonly name: string;
  readonly joinIndex: number;
}

/** The "@partial" at the end of the text, or null when the last word is not a mention. */
export function activeMentionQuery(text: string): string | null {
  const match = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(text);
  return match?.[1] ?? null;
}

export function mentionMatches(
  candidates: readonly MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const lower = query.toLocaleLowerCase();
  return candidates.filter((candidate) => candidate.name.toLocaleLowerCase().startsWith(lower));
}

/** Replaces the trailing "@partial" with "@Name ". */
export function completeMention(text: string, candidate: MentionCandidate): string {
  return text.replace(/@[\p{L}\p{N}_-]*$/u, `@${candidate.name} `);
}

/** Mentions of picked candidates still present in the final text. */
export function mentionsIn(
  text: string,
  picked: readonly MentionCandidate[],
): { readonly mentions: string[]; readonly mentionsGuide: boolean } {
  const present = picked.filter((candidate) => text.includes(`@${candidate.name}`));
  return {
    mentions: [...new Set(present.filter((c) => c.kind === 'member').map((c) => c.id))],
    mentionsGuide: present.some((c) => c.kind === 'guide'),
  };
}

export function candidateName(name: string | null): string | null {
  return firstName(name);
}

const useStyles = makeStyles((th) => ({
  panel: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingVertical: th.space['6'],
  },
  row: {
    alignItems: 'center',
    gap: th.space['10'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['8'],
  },
}));

export function MentionPicker({
  matches,
  onPick,
}: {
  readonly matches: readonly MentionCandidate[];
  readonly onPick: (candidate: MentionCandidate) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (matches.length === 0) return null;
  return (
    <Stack
      style={styles.panel}
      accessibilityLabel={t({ id: 'chat.mention.suggestions', message: 'Mention suggestions' })}
      testID="chat-mentions"
    >
      {matches.slice(0, 6).map((candidate) => (
        <PressScale
          key={`${candidate.kind}-${candidate.id}`}
          accessibilityLabel={t({ id: 'chat.mention.pick', message: `Mention ${candidate.name}` })}
          onPress={() => onPick(candidate)}
          testID={`chat-mention-${candidate.id}`}
        >
          <Row style={styles.row}>
            <Avatar
              name={candidate.name}
              uid={candidate.kind === 'member' ? candidate.id : null}
              joinIndex={candidate.joinIndex}
              size="sm"
              decorative
            />
            <Text variant="body">{candidate.name}</Text>
            {candidate.kind === 'guide' ? (
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {t({ id: 'chat.mention.guide', message: 'Guide' })}
              </Text>
            ) : null}
          </Row>
        </PressScale>
      ))}
    </Stack>
  );
}
