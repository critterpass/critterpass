import { t } from '@lingui/core/macro';

import { votesLabel } from '../data/PollBars';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface IdeaVoteBoxProps {
  readonly count: number;
  readonly voted: boolean;
  readonly onToggle?: () => void;
  /** The idea, for the spoken label ("Packing lists per crew"). */
  readonly ideaTitle: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  box: {
    width: MIN_TOUCH_TARGET + th.space['8'],
    borderRadius: th.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: th.space['6'],
    borderWidth: th.space['2'],
  },
}));

/** Upvote box (▲ + count); fills yellow when it holds your vote. Tap again to take it back. */
export function IdeaVoteBox({
  count,
  voted,
  onToggle,
  ideaTitle,
  disabled,
  testID,
}: IdeaVoteBoxProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fg = voted ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const upvote = t({ id: 'common.vote.upvote', message: `Upvote ${ideaTitle}` });
  return (
    <PressScale
      testID={testID}
      widthClass="narrow"
      disabled={disabled}
      accessibilityLabel={upvote}
      accessibilityValue={{ text: votesLabel(count) }}
      accessibilityState={{ selected: voted }}
      {...(onToggle ? { onPress: onToggle } : {})}
      style={[
        styles.box,
        {
          backgroundColor: voted ? theme.semantic.action.primary : theme.semantic.bg.raised,
          borderColor: voted ? theme.semantic.action.primary : theme.semantic.border.control,
        },
      ]}
    >
      <Text variant="label" color={fg}>
        ▲
      </Text>
      <Text variant="title" color={fg}>
        {String(count)}
      </Text>
    </PressScale>
  );
}
