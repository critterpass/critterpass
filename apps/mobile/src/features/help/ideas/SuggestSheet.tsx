/**
 * Suggest an idea (3p-5), over the board: NEW IDEA, the title ("IN A FEW WORDS"), the ideas it
 * sounds like with the guide's nudge and a VOTE ▲ on each, the optional "what would it do?", and
 * MINE'S DIFFERENT, POST IT (POST IT when nothing matches).
 */
import { IDEA_TITLE_MIN } from '@cp/domain';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { BoardStatus } from './board';

export interface SuggestMatch {
  readonly id: string;
  readonly title: string;
  readonly status: BoardStatus;
  readonly count: number;
  readonly voted: boolean;
}

export interface SuggestSheetProps {
  readonly title: string;
  readonly onTitle: (text: string) => void;
  readonly description: string;
  readonly onDescription: (text: string) => void;
  readonly matches: readonly SuggestMatch[];
  readonly posting: boolean;
  readonly onVote: (id: string) => void;
  readonly onPost: () => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'], gap: t.space['16'] },
  nudge: {
    backgroundColor: t.semantic.state.info,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['12'],
  },
  match: {
    backgroundColor: t.semantic.bg.base,
    borderRadius: t.radius.md,
    padding: t.space['12'],
  },
  matchText: { flex: 1, minWidth: 0 },
  line: { flex: 1, minWidth: 0 },
}));

function useStatusWord(): (status: BoardStatus) => string {
  const { t } = useLingui();
  return (status) =>
    status === 'planned'
      ? t({ id: 'help.ideas.planned', message: 'Planned' })
      : status === 'building'
        ? t({ id: 'help.ideas.building', message: 'Building' })
        : t({ id: 'help.ideas.open', message: 'Looking at it' });
}

export function SuggestSheet(props: SuggestSheetProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const statusWord = useStatusWord();
  const guide = guideSticker('tokek');
  const heading = t({ id: 'help.suggest.title', message: 'Suggest an idea' });
  const matched = props.matches.length > 0;
  return (
    <Sheet
      detents={['large']}
      closable={false}
      onDismiss={props.onClose}
      accessibilityLabel={heading}
      testID="help-suggest"
    >
      <View style={styles.body}>
        <Stack gap="4">
          <Text variant="eyebrow" color={theme.semantic.state.info}>
            {t({ id: 'help.suggest.eyebrow', message: 'New idea' })}
          </Text>
          <Text variant="h1" accessibilityRole="header">
            {heading}
          </Text>
        </Stack>
        <TextField
          label={t({ id: 'help.suggest.titleLabel', message: 'In a few words' })}
          value={props.title}
          onChangeText={props.onTitle}
          testID="help-suggest-title"
        />
        {matched ? (
          <View style={styles.nudge} testID="help-suggest-matches">
            <Row gap="12" align="center">
              <Sticker
                kind={guide.kind}
                name={guide.name}
                size={40}
                variant="mask"
                sticker={null}
              />
              <Text variant="voice" color={theme.semantic.text.onAccent} style={styles.line}>
                {props.matches.length === 1
                  ? t({
                      id: 'help.suggest.matchOne',
                      message: 'Sounds like this one. Vote for it and it gets there faster.',
                    })
                  : t({
                      id: 'help.suggest.matchMany',
                      message: 'Sounds like one of these. Vote for it and it gets there faster.',
                    })}
              </Text>
            </Row>
            {props.matches.map((match) => (
              <Row key={match.id} gap="12" style={styles.match}>
                <View style={styles.matchText}>
                  <Text variant="rowTitle">{match.title.toUpperCase()}</Text>
                  <Text variant="caption" color={theme.semantic.text.secondary}>
                    {t({
                      id: 'help.suggest.matchMeta',
                      message: plural(match.count, { one: '# vote', other: '# votes' }),
                    })}
                    {` · ${statusWord(match.status)}`}
                  </Text>
                </View>
                <PillButton
                  size="sm"
                  label={t({ id: 'help.suggest.vote', message: 'Vote ▲' })}
                  onPress={() => props.onVote(match.id)}
                  disabled={match.voted}
                  testID={`help-suggest-vote-${match.id}`}
                />
              </Row>
            ))}
          </View>
        ) : null}
        <TextField
          label={t({ id: 'help.suggest.descriptionLabel', message: 'What would it do? Optional' })}
          value={props.description}
          onChangeText={props.onDescription}
          maxLines={4}
          testID="help-suggest-description"
        />
        <PillButton
          variant={matched ? 'secondary' : 'primary'}
          label={
            matched
              ? t({ id: 'help.suggest.postAnyway', message: 'Mine’s different, post it' })
              : t({ id: 'help.suggest.post', message: 'Post it' })
          }
          onPress={props.onPost}
          disabled={props.title.trim().length < IDEA_TITLE_MIN}
          loading={props.posting}
          block
          testID="help-suggest-post"
        />
      </View>
    </Sheet>
  );
}
