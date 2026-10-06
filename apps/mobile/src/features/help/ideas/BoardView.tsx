/**
 * The idea board (3p-4): ← HELP with the votes left this month, WHAT'S NEXT?, TOP / NEW / SHIPPED,
 * one row per idea (the vote box, the title, its status and either the crewmates who voted too or
 * the team's note) and + SUGGEST AN IDEA held at the foot. The traveller's own ideas still in
 * review show under NEW as "Under review" without a vote box.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { InfoPill } from '@/ui/chips/InfoPill';
import { StatusChip, type ChipStatus } from '@/ui/chips/StatusChip';
import { Segmented } from '@/ui/inputs/Segmented';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { IdeaVoteBox } from '@/ui/vote/IdeaVoteBox';

import type { BoardStatus, BoardTab } from './board';

export interface BoardRow {
  readonly id: string;
  readonly title: string;
  readonly status: BoardStatus;
  readonly count: number;
  readonly voted: boolean;
  readonly votable: boolean;
  readonly faces: readonly string[];
  readonly teamNote: string | null;
}

export interface BoardViewProps {
  readonly tab: BoardTab;
  readonly onTab: (tab: BoardTab) => void;
  readonly rows: readonly BoardRow[];
  readonly votesLeft: number;
  /** The board could not be read and no copy is kept yet. */
  readonly unavailable: boolean;
  readonly loaded: boolean;
  readonly onVote: (id: string) => void;
  readonly onSuggest: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  body: { flex: 1, minWidth: 0 },
}));

function useStatusChip(): (status: BoardStatus) => { status: ChipStatus; label: string } {
  const { t } = useLingui();
  return (status) => {
    switch (status) {
      case 'planned':
        return { status: 'planned', label: t({ id: 'help.ideas.planned', message: 'Planned' }) };
      case 'building':
        return { status: 'building', label: t({ id: 'help.ideas.building', message: 'Building' }) };
      case 'shipped':
        return { status: 'booked', label: t({ id: 'help.ideas.shipped', message: 'Shipped' }) };
      case 'pending_review':
        return {
          status: 'unopened',
          label: t({ id: 'help.ideas.underReview', message: 'Under review' }),
        };
      case 'declined':
        return { status: 'ended', label: t({ id: 'help.ideas.declined', message: 'Declined' }) };
      case 'merged':
        return { status: 'ended', label: t({ id: 'help.ideas.merged', message: 'Merged' }) };
      case 'open':
        return { status: 'free', label: t({ id: 'help.ideas.open', message: 'Looking at it' }) };
    }
  };
}

function facesLine(names: readonly string[], t: ReturnType<typeof useLingui>['t']): string {
  const [first, second] = names;
  if (first === undefined) return '';
  if (second === undefined) return t({ id: 'help.ideas.faceOne', message: `${first} too` });
  if (names.length === 2) {
    return t({ id: 'help.ideas.faceTwo', message: `${first} and ${second} too` });
  }
  const others = names.length - 1;
  return t({
    id: 'help.ideas.faceMany',
    message: plural(others, {
      one: `${first} and # other too`,
      other: `${first} and # others too`,
    }),
  });
}

export function BoardView(props: BoardViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const chip = useStatusChip();
  return (
    <Scaffold variant="dark" edges={['top']} testID="help-ideas">
      <ScrollView contentContainerStyle={styles.content}>
        <Row justify="space-between">
          <BackEyebrow
            label={t({ id: 'help.ideas.back', message: 'Help' })}
            onPress={props.onBack}
            testID="help-ideas-back"
          />
          <InfoPill testID="help-ideas-votes-left">
            {t({
              id: 'help.ideas.votesLeft',
              message: plural(props.votesLeft, { one: '# vote left', other: '# votes left' }),
            }).toUpperCase()}
          </InfoPill>
        </Row>
        <Text variant="displayXl" accessibilityRole="header">
          {t({ id: 'help.ideas.title', message: 'What’s next?' })}
        </Text>
        <Segmented
          label={t({ id: 'help.ideas.tabs', message: 'Which ideas' })}
          segments={[
            { value: 'top', label: t({ id: 'help.ideas.top', message: 'Top' }) },
            { value: 'new', label: t({ id: 'help.ideas.new', message: 'New' }) },
            { value: 'shipped', label: t({ id: 'help.ideas.shippedTab', message: 'Shipped' }) },
          ]}
          value={props.tab}
          onChange={props.onTab}
          testID="help-ideas-tabs"
        />
        {props.unavailable ? (
          <SecondaryText>
            {t({
              id: 'help.ideas.offline',
              message: 'The board opens once you’re back online.',
            })}
          </SecondaryText>
        ) : props.loaded && props.rows.length === 0 ? (
          <SecondaryText>
            {props.tab === 'shipped'
              ? t({ id: 'help.ideas.noneShipped', message: 'Nothing shipped from here yet.' })
              : t({ id: 'help.ideas.none', message: 'No ideas yet. Yours could be the first.' })}
          </SecondaryText>
        ) : null}
        <Stack gap="8">
          {props.rows.map((row) => {
            const { status, label } = chip(row.status);
            return (
              <Card key={row.id} testID={`help-idea-${row.id}`}>
                <Row gap="12" align="center">
                  {row.status === 'pending_review' ? null : (
                    <IdeaVoteBox
                      count={row.count}
                      voted={row.voted}
                      ideaTitle={row.title}
                      disabled={!row.votable}
                      {...(row.votable ? { onToggle: () => props.onVote(row.id) } : {})}
                      testID={`help-idea-vote-${row.id}`}
                    />
                  )}
                  <View style={styles.body}>
                    <Stack gap="6">
                      <Text variant="rowTitle">{row.title.toUpperCase()}</Text>
                      <Row gap="8" wrap>
                        <StatusChip status={status} label={label.toUpperCase()} />
                        {row.faces.length > 0 ? (
                          <Row gap="6">
                            <AvatarStack
                              members={row.faces.map((name, index) => ({
                                key: `${index}`,
                                name,
                                joinIndex: index,
                              }))}
                              max={3}
                              size="sm"
                            />
                            <Text variant="caption" color={theme.semantic.text.secondary}>
                              {facesLine(row.faces, t)}
                            </Text>
                          </Row>
                        ) : row.teamNote !== null ? (
                          <Text variant="caption" color={theme.semantic.text.secondary}>
                            {t({
                              id: 'help.ideas.teamNote',
                              message: `Tokek: ${row.teamNote}`,
                            })}
                          </Text>
                        ) : null}
                      </Row>
                    </Stack>
                  </View>
                </Row>
              </Card>
            );
          })}
        </Stack>
      </ScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'help.ideas.suggest', message: '+ Suggest an idea' })}
          onPress={props.onSuggest}
          block
          testID="help-ideas-suggest"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
