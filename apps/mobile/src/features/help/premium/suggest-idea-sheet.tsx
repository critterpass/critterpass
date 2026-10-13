/**
 * Suggest an idea over the idea board: a native page sheet (swipe down or Cancel puts it away)
 * with Cancel left, the title centred and Post right; the idea in a few words, the look-alikes
 * already on the board with a vote each (Tokek says voting gets one there faster), and what it
 * would do. Undesigned in the premium set: built from the kit's sheet grammar.
 */
import { IDEA_TITLE_MIN } from '@cp/domain';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  GuideNote,
  ListCard,
  Row,
  Spinner,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';

import type { BoardStatus } from '../ideas/board';

export interface SuggestMatch {
  readonly id: string;
  readonly title: string;
  readonly status: BoardStatus;
  readonly count: number;
  readonly voted: boolean;
}

export interface SuggestIdeaSheetProps {
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

function useStatusWord(): (status: BoardStatus) => string {
  const { t } = useLingui();
  return (status) =>
    status === 'planned'
      ? t({ id: 'help.ideas.planned', message: 'Planned' })
      : status === 'building'
        ? t({ id: 'help.ideas.building', message: 'Building' })
        : t({ id: 'help.ideas.open', message: 'Looking at it' });
}

export function SuggestIdeaSheet(props: SuggestIdeaSheetProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const statusWord = useStatusWord();
  const heading = t({ id: 'help.suggest.title', message: 'Suggest an idea' });
  const canPost = props.title.trim().length >= IDEA_TITLE_MIN && !props.posting;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <View style={[styles.fill, { backgroundColor: th.color.ground }]} testID="help-suggest">
        <View style={[styles.head, { paddingHorizontal: th.space.gutter }]}>
          <TextButton
            label={t({ id: 'help.premium.suggestCancel', message: 'Cancel' })}
            onPress={props.onClose}
            testID="help-suggest-cancel"
          />
          <Text variant="navTitle" accessibilityRole="header" style={styles.title}>
            {heading}
          </Text>
          {props.posting ? (
            <Spinner />
          ) : (
            <TextButton
              label={t({ id: 'help.suggest.post', message: 'Post it' })}
              tone="ink"
              onPress={props.onPost}
              disabled={!canPost}
              testID="help-suggest-post"
            />
          )}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: th.space.gutter, gap: th.space.gap16 }}
        >
          <TextField
            accessibilityLabel={t({ id: 'help.suggest.titleLabel', message: 'In a few words' })}
            placeholder={t({ id: 'help.suggest.titleLabel', message: 'In a few words' })}
            value={props.title}
            onChangeText={props.onTitle}
            autoFocus
            testID="help-suggest-title"
          />
          {props.matches.length === 0 ? null : (
            <View style={{ gap: th.space.gap10 }} testID="help-suggest-matches">
              <GuideNote
                name="Tokek"
                text={
                  props.matches.length === 1
                    ? t({
                        id: 'help.suggest.matchOne',
                        message: 'Sounds like this one. Vote for it and it gets there faster.',
                      })
                    : t({
                        id: 'help.suggest.matchMany',
                        message: 'Sounds like one of these. Vote for it and it gets there faster.',
                      })
                }
              />
              <ListCard>
                {props.matches.map((match) => (
                  <Row
                    key={match.id}
                    title={match.title}
                    subtitle={`${t({
                      id: 'help.suggest.matchMeta',
                      message: plural(match.count, { one: '# vote', other: '# votes' }),
                    })} · ${statusWord(match.status)}`}
                    trailing={
                      <Button
                        size="small"
                        variant="control"
                        label={t({ id: 'help.suggest.vote', message: 'Vote ▲' })}
                        onPress={() => props.onVote(match.id)}
                        disabled={match.voted}
                        testID={`help-suggest-vote-${match.id}`}
                      />
                    }
                  />
                ))}
              </ListCard>
            </View>
          )}
          <TextField
            accessibilityLabel={t({
              id: 'help.suggest.descriptionLabel',
              message: 'What would it do? Optional',
            })}
            placeholder={t({
              id: 'help.suggest.descriptionLabel',
              message: 'What would it do? Optional',
            })}
            value={props.description}
            onChangeText={props.onDescription}
            multiline
            testID="help-suggest-description"
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingTop: 8,
  },
  title: { flex: 1, textAlign: 'center' },
});
