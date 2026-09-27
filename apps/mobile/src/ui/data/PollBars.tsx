import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { Stack } from '../layout/Stack';
import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { GrowBar } from './LinearBar';

export interface PollOption {
  readonly label: string;
  readonly votes: number;
  /** Bar colour (the option's guide or member colour). @default action.primary */
  readonly color?: string;
  /** The viewer voted for this option. */
  readonly mine?: boolean;
}

export interface PollBarsProps {
  readonly options: readonly PollOption[];
  /** The question, leading the summary. */
  readonly question?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  track: {
    height: th.space['24'],
    borderRadius: th.radius.sm,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
  },
  mine: { borderWidth: th.space['2'], borderColor: th.semantic.text.primary },
}));

export function votesLabel(votes: number): string {
  return t({
    id: 'common.data.votes',
    message: plural(votes, { one: '# vote', other: '# votes' }),
  });
}

/** Poll results: one bar per option with vote count and share; the viewer's pick is outlined. */
export function PollBars({ options, question, testID }: PollBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const total = options.reduce((sum, option) => sum + option.votes, 0);
  const yours = t({ id: 'common.data.yourVote', message: 'your vote' });
  const lines = options.map((option) => {
    const share = format.percent(locale, total > 0 ? option.votes / total : 0);
    return [option.label, votesLabel(option.votes), share, option.mine ? yours : undefined]
      .filter(Boolean)
      .join(', ');
  });
  return (
    <Stack
      gap="10"
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={[question, ...lines].filter(Boolean).join('; ')}
    >
      {options.map((option, index) => (
        <Stack key={option.label} gap="4">
          <Row justify="space-between">
            <Text variant="title">{option.label}</Text>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {votesLabel(option.votes)}
            </Text>
          </Row>
          <View style={[styles.track, option.mine ? styles.mine : null]}>
            <GrowBar
              fraction={total > 0 ? option.votes / total : 0}
              color={option.color ?? theme.semantic.action.primary}
              index={index}
            />
          </View>
        </Stack>
      ))}
    </Stack>
  );
}
