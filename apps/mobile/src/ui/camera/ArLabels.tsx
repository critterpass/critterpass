import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface ArLabel {
  readonly id: string;
  /** Anchor position as fractions of the frame, 0 to 1. */
  readonly x: number;
  readonly y: number;
  /** The original text on the menu ("Gado-gado"). */
  readonly source: string;
  /** Translation ("Veg, peanut sauce"). */
  readonly text: string;
  /** Crew dietary notes ("Jordan ✓ veg", "Alex ✕ peanuts"). */
  readonly notes?: readonly { readonly label: string; readonly clash: boolean }[];
}

export interface ArLabelsProps {
  /** Camera feed. */
  readonly children?: ReactNode;
  readonly labels: readonly ArLabel[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  root: { flex: 1, overflow: 'hidden' },
  pill: {
    position: 'absolute',
    maxWidth: '60%',
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
    transform: [{ rotate: `${-2}deg` }],
  },
  note: {
    borderRadius: th.radius.xs,
    paddingHorizontal: th.space['6'],
    paddingVertical: th.space['2'],
    alignSelf: 'flex-start',
  },
}));

/** Translations peeled onto the camera view; clashing dishes turn pink, each reads source and meaning. */
export function ArLabels({ children, labels, testID }: ArLabelsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View testID={testID} style={styles.root}>
      {children}
      {labels.map((label) => {
        const clash = label.notes?.some((note) => note.clash) === true;
        return (
          <Stack
            key={label.id}
            gap="2"
            accessible
            accessibilityRole="text"
            accessibilityLabel={[
              `${label.source}: ${label.text}`,
              ...(label.notes ?? []).map((n) => n.label),
            ].join(', ')}
            style={[
              styles.pill,
              { left: `${label.x * 100}%`, top: `${label.y * 100}%` },
              clash ? { backgroundColor: theme.semantic.state.urgent } : null,
            ]}
          >
            <Text variant="label" color={theme.color.paper.ink}>
              {label.text}
            </Text>
            {label.notes?.map((note) => (
              <View
                key={note.label}
                style={[
                  styles.note,
                  {
                    backgroundColor: note.clash
                      ? theme.color.paper.base
                      : theme.semantic.state.success,
                  },
                ]}
              >
                <Text variant="label" color={theme.color.paper.ink}>
                  {note.label}
                </Text>
              </View>
            ))}
          </Stack>
        );
      })}
    </View>
  );
}
