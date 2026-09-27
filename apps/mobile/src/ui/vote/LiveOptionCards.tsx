import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';

import { SecondaryText } from '../cards/SecondaryText';
import { votesLabel } from '../data/PollBars';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface LiveOption {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  /** Photo or hatch placeholder across the top. */
  readonly media?: ReactNode;
  readonly voters?: ReactNode;
  readonly votes: number;
  readonly mine?: boolean;
}

export interface PresenceCursor {
  readonly id: string;
  readonly name: string;
  /** Member colour. */
  readonly color: string;
  /** Option the person is looking at. */
  readonly optionId: string;
}

export interface LiveOptionCardsProps {
  readonly options: readonly LiveOption[];
  /** Who is browsing which card right now. */
  readonly presence?: readonly PresenceCursor[];
  readonly onVote?: (id: string) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    flex: 1,
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    overflow: 'hidden',
  },
  body: { padding: th.space['12'], gap: th.space['6'] },
  media: { height: th.space['32'] * 3, backgroundColor: th.semantic.bg.control },
  leading: {
    position: 'absolute',
    top: th.space['8'],
    start: th.space['8'],
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['2'],
    backgroundColor: th.semantic.action.primary,
  },
  cursors: {
    position: 'absolute',
    top: th.space['8'],
    end: th.space['8'],
    gap: th.space['4'],
    alignItems: 'flex-end',
  },
  cursor: {
    borderRadius: th.radius.sm,
    borderTopEndRadius: th.radius.xs,
    paddingHorizontal: th.space['6'],
    paddingVertical: th.space['2'],
  },
}));

/** Side-by-side live vote options with the leading tag and presence cursors of who is looking. */
export function LiveOptionCards({ options, presence = [], onVote, testID }: LiveOptionCardsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const top = Math.max(0, ...options.map((option) => option.votes));
  const leadingWord = t({ id: 'common.vote.leading', message: 'Leading' });
  return (
    <Row gap="10" align="stretch" testID={testID}>
      {options.map((option) => {
        const leading = top > 0 && option.votes === top;
        const here = presence.filter((cursor) => cursor.optionId === option.id);
        const names = format.list(
          locale,
          here.map((cursor) => cursor.name),
        );
        const looking =
          here.length > 0
            ? t({ id: 'common.vote.lookingHere', message: `${names} looking` })
            : undefined;
        const label = [
          option.title,
          option.detail,
          votesLabel(option.votes),
          leading ? leadingWord : undefined,
          looking,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <PressScale
            key={option.id}
            widthClass="medium"
            accessibilityLabel={label}
            accessibilityState={{ selected: option.mine === true }}
            {...(onVote ? { onPress: () => onVote(option.id) } : {})}
            style={[
              styles.card,
              option.mine
                ? { borderWidth: theme.ring.focus.widthPt, borderColor: theme.ring.focus.color }
                : null,
            ]}
          >
            <View style={styles.media}>{option.media}</View>
            <Stack style={styles.body}>
              <Text variant="title">{option.title}</Text>
              {option.detail ? <SecondaryText>{option.detail}</SecondaryText> : null}
              <Row gap="6" align="center">
                {option.voters}
                <Text variant="label">{String(option.votes)}</Text>
              </Row>
            </Stack>
            {leading ? (
              <View style={styles.leading}>
                <Text variant="label" color={theme.semantic.text.onAccent}>
                  {leadingWord}
                </Text>
              </View>
            ) : null}
            <View style={styles.cursors} pointerEvents="none">
              {here.map((cursor) => (
                <View key={cursor.id} style={[styles.cursor, { backgroundColor: cursor.color }]}>
                  <Text variant="label" color={theme.semantic.text.onAccent}>
                    {cursor.name}
                  </Text>
                </View>
              ))}
            </View>
          </PressScale>
        );
      })}
    </Row>
  );
}
