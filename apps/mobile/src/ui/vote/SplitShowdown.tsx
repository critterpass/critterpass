import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { votesLabel } from '../data/PollBars';
import { Halftone } from '../textures/halftone';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';
import { voteOptionLabel } from './VoteBoard';

export interface ShowdownSide {
  readonly id: string;
  readonly name: string;
  /** Half colour (the place colour). */
  readonly color: string;
  /** Faint sticker art behind the name. */
  readonly sticker?: ReactNode;
  /** The guide's campaign line (GuideLine bubble). */
  readonly pitch?: ReactNode;
  /** Info pills ("7h flight", "$1,480 each"). */
  readonly facts?: ReactNode;
  readonly voters?: ReactNode;
  readonly votes: number;
  readonly mine?: boolean;
}

export interface SplitShowdownProps {
  readonly sides: readonly [ShowdownSide, ShowdownSide];
  readonly onVote?: (id: string) => void;
  /** Mini card on Home: smaller type, no pitch or facts. */
  readonly compact?: boolean;
  /** Status bar under the halves ("1 vote · Dev and Rin to go"). */
  readonly footer?: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  half: { padding: th.space['20'], overflow: 'hidden' },
  sticker: { position: 'absolute', end: th.space['8'], bottom: th.space['8'], opacity: 0.35 },
  vsWrap: { alignItems: 'center', height: 0, zIndex: 1, justifyContent: 'center' },
  vs: {
    width: sizeToken(th.size.fab, 'size'),
    height: sizeToken(th.size.fab, 'size'),
    borderRadius: sizeToken(th.size.fab, 'size') / 2,
    borderWidth: sizeToken(th.size.fab, 'ringWidth'),
    borderColor: th.color.paper.base,
    backgroundColor: th.semantic.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

function Half({
  side,
  compact,
  onVote,
  alignEnd,
}: {
  readonly side: ShowdownSide;
  readonly compact: boolean;
  readonly onVote: ((id: string) => void) | undefined;
  readonly alignEnd: boolean;
}) {
  const styles = useStyles();
  return (
    <PressScale
      widthClass="wide"
      accessibilityLabel={voteOptionLabel(side.name, side.votes, side.mine)}
      accessibilityHint={t({ id: 'common.vote.tapToVote', message: 'Votes for this place' })}
      accessibilityState={{ selected: side.mine === true }}
      {...(onVote ? { onPress: () => onVote(side.id) } : {})}
      style={[styles.half, { backgroundColor: side.color }]}
    >
      <SurfaceToneProvider value="accent">
        <Halftone />
        {side.sticker ? (
          <View style={styles.sticker} pointerEvents="none">
            {side.sticker}
          </View>
        ) : null}
        <Stack gap="10" align={alignEnd ? 'flex-end' : 'flex-start'}>
          <Text variant={compact ? 'h2' : 'displayMega'} autoFit>
            {side.name}
          </Text>
          {compact ? null : side.pitch}
          {compact ? null : side.facts}
          <Row gap="8" align="center">
            {side.voters}
            <Text variant="title">{votesLabel(side.votes)}</Text>
          </Row>
        </Stack>
      </SurfaceToneProvider>
    </PressScale>
  );
}

/** Final two-place vote: coloured halves with a VS badge; tap a half to vote for it. */
export function SplitShowdown({
  sides,
  onVote,
  compact = false,
  footer,
  testID,
}: SplitShowdownProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack testID={testID}>
      <Half side={sides[0]} compact={compact} onVote={onVote} alignEnd={false} />
      <View style={styles.vsWrap} importantForAccessibility="no-hide-descendants">
        <View style={styles.vs}>
          <Text variant="h3" color={theme.semantic.action.primary}>
            {t({ id: 'common.vote.versus', message: 'vs' })}
          </Text>
        </View>
      </View>
      <Half side={sides[1]} compact={compact} onVote={onVote} alignEnd />
      {footer}
    </Stack>
  );
}
