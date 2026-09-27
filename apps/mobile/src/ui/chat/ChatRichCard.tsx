import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SecondaryText } from '../cards/SecondaryText';
import { GrowBar } from '../data/LinearBar';
import { votesLabel } from '../data/PollBars';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { TypingDots } from './TypingDots';

export interface ChatPollOption {
  readonly id: string;
  readonly label: string;
  readonly votes: number;
  readonly voters?: ReactNode;
  readonly mine?: boolean;
}

export type ChatRichCardProps = { readonly testID?: string } & (
  | {
      readonly kind: 'poll';
      readonly title: string;
      /** "Maya's poll". */
      readonly byline?: string;
      readonly options: readonly ChatPollOption[];
      readonly onVote?: (id: string) => void;
    }
  | {
      readonly kind: 'offer';
      /** The guide's line. */
      readonly text: string;
      readonly guideColor?: string;
      readonly ctaLabel: string;
      readonly onAccept?: () => void;
    }
  | {
      readonly kind: 'expense';
      readonly title: string;
      readonly detail?: string;
      readonly icon?: ReactNode;
      readonly actionLabel: string;
      readonly onOpen?: () => void;
    }
  | {
      readonly kind: 'boost';
      /** "Winston boosted Kyoto". */
      readonly title: string;
      readonly detail?: string;
      /** Perk chips ("∞ redrafts", "Live map"). */
      readonly perks: readonly string[];
      readonly footer?: ReactNode;
    }
  | {
      readonly kind: 'settled';
      readonly label: string;
      readonly detail?: string;
      readonly people?: ReactNode;
    }
  | { readonly kind: 'typing'; readonly name: string; readonly avatar?: ReactNode }
);

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['8'],
  },
  option: {
    height: th.size.minTouchTarget.height,
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  optionRow: { paddingHorizontal: th.space['12'] },
  outlined: { borderWidth: th.space['2'], borderColor: th.semantic.border.control },
  boost: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.brand.boost,
  },
  perk: {
    backgroundColor: th.semantic.brand.boost,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
  typing: { alignSelf: 'flex-start', paddingVertical: th.space['10'] },
}));

function Poll(props: Extract<ChatRichCardProps, { kind: 'poll' }>) {
  const styles = useStyles();
  const theme = useTheme();
  const total = props.options.reduce((sum, option) => sum + option.votes, 0);
  const yours = t({ id: 'common.data.yourVote', message: 'your vote' });
  return (
    <Stack style={styles.card} testID={props.testID}>
      <Row justify="space-between" align="baseline" accessible accessibilityRole="header">
        <Text variant="title">{props.title}</Text>
        {props.byline ? <SecondaryText>{props.byline}</SecondaryText> : null}
      </Row>
      {props.options.map((option, index) => (
        <PressScale
          key={option.id}
          widthClass="wide"
          accessibilityLabel={[
            option.label,
            votesLabel(option.votes),
            option.mine ? yours : undefined,
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityState={{ selected: option.mine === true }}
          {...(props.onVote ? { onPress: () => props.onVote?.(option.id) } : {})}
          style={styles.option}
        >
          <View style={styles.fill}>
            <GrowBar
              fraction={total > 0 ? option.votes / total : 0}
              color={option.mine ? theme.semantic.state.success : theme.color.ink['600']}
              index={index}
            />
          </View>
          <Row justify="space-between" align="center" style={styles.optionRow}>
            <Text variant="label" color={option.mine ? theme.semantic.text.onAccent : undefined}>
              {option.label}
            </Text>
            <Row gap="6" align="center">
              {option.voters}
              <Text variant="title">{String(option.votes)}</Text>
            </Row>
          </Row>
        </PressScale>
      ))}
    </Stack>
  );
}

/**
 * Structured cards that land in a chat thread: poll, bookable offer, expense, boost, settled strip
 * and the typing indicator. Each reads as one element with its action exposed as a button.
 */
export function ChatRichCard(props: ChatRichCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  switch (props.kind) {
    case 'poll':
      return <Poll {...props} />;
    case 'offer':
      return (
        <Stack style={styles.card} testID={props.testID}>
          <Text variant="voice" color={props.guideColor ?? theme.guide.tokek}>
            {props.text}
          </Text>
          <Row>
            <ActionPill
              tone="primary"
              label={props.ctaLabel}
              {...(props.onAccept ? { onPress: props.onAccept } : { disabled: true })}
            />
          </Row>
        </Stack>
      );
    case 'expense':
      return (
        <Row gap="12" align="center" style={[styles.card, styles.outlined]} testID={props.testID}>
          {props.icon}
          <Stack
            gap="2"
            flex={1}
            accessible
            accessibilityRole="text"
            accessibilityLabel={[props.title, props.detail].filter(Boolean).join(', ')}
          >
            <Text variant="rowTitle">{props.title}</Text>
            {props.detail ? <SecondaryText>{props.detail}</SecondaryText> : null}
          </Stack>
          <ActionPill
            tone="outline"
            label={props.actionLabel}
            accessibilityLabel={`${props.actionLabel}, ${props.title}`}
            {...(props.onOpen ? { onPress: props.onOpen } : { disabled: true })}
          />
        </Row>
      );
    case 'boost':
      return (
        <Stack style={[styles.card, styles.boost]} testID={props.testID}>
          <Stack
            gap="4"
            accessible
            accessibilityRole="text"
            accessibilityLabel={[props.title, props.detail, ...props.perks]
              .filter(Boolean)
              .join(', ')}
          >
            <Text variant="h3" color={theme.semantic.brand.boost}>
              {props.title}
            </Text>
            {props.detail ? <SecondaryText>{props.detail}</SecondaryText> : null}
            <Row gap="6" wrap>
              {props.perks.map((perk) => (
                <View key={perk} style={styles.perk}>
                  <Text variant="label" color={theme.semantic.text.onAccent}>
                    {perk}
                  </Text>
                </View>
              ))}
            </Row>
          </Stack>
          {props.footer}
        </Stack>
      );
    case 'settled':
      return (
        <Row
          gap="10"
          align="center"
          style={styles.card}
          testID={props.testID}
          accessible
          accessibilityRole="text"
          accessibilityLabel={[props.label, props.detail].filter(Boolean).join(', ')}
        >
          <Text variant="label" color={theme.semantic.state.success}>
            {props.label}
          </Text>
          {props.detail ? <SecondaryText style={{ flex: 1 }}>{props.detail}</SecondaryText> : null}
          {props.people}
        </Row>
      );
    case 'typing': {
      const name = props.name;
      return (
        <Row
          gap="8"
          align="center"
          testID={props.testID}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t({ id: 'common.plan.isTyping', message: `${name} is typing` })}
        >
          {props.avatar}
          <View style={[styles.card, styles.typing]}>
            <TypingDots />
          </View>
        </Row>
      );
    }
  }
}
