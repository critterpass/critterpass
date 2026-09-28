import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { ThemeProvider } from '@/lib/theme';
import { makeStyles, MIN_TOUCH_TARGET, Row, Scaffold, Stack, Text, useTheme } from '@/ui';
import {
  fixturesFor,
  loadAllFixtures,
  useFixtureRegistry,
  useGallerySettings,
} from '@/ui/gallery/registry';
import type { GroupState } from '@/ui/gallery/state-groups';
import { STATE_GROUPS } from '@/ui/gallery/state-groups';

export const __CP_DEV_ROUTE__ = true;

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['16'] },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['12'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.control,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: t.semantic.action.primary },
  frame: {
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.semantic.border.decorative,
    padding: t.space['12'],
  },
}));

function StateChip({
  state,
  selected,
  onPress,
}: {
  readonly state: GroupState;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      testID={`state-${state.screen}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      <Text variant="label" color={selected ? theme.semantic.text.onAccent : undefined}>
        {`${state.screen} ${state.label}`}
      </Text>
    </Pressable>
  );
}

/**
 * The prototype's state groups: the selected screen state's fixtures render at the top (Next steps
 * through them), the chips below pick any state, under the gallery's text and contrast settings.
 */
export default function GalleryStatesScreen() {
  loadAllFixtures();
  useFixtureRegistry();
  const styles = useStyles();
  const settings = useGallerySettings();
  const first = STATE_GROUPS[0]?.states[0];
  const [selected, setSelected] = useState<GroupState | undefined>(first);
  const all = STATE_GROUPS.flatMap((group) => group.states);
  const next = all[all.findIndex((state) => state.screen === selected?.screen) + 1];

  return (
    <Scaffold testID="gallery-states-page">
      <ScrollView contentContainerStyle={styles.content}>
        <Row gap="12" justify="space-between">
          <Text variant="h2" accessibilityRole="header">
            State groups
          </Text>
          {next ? (
            // Screenshot flows step through every state here without scrolling to its chip.
            <Pressable
              testID="state-next"
              accessibilityRole="button"
              accessibilityLabel={`Next: ${next.screen} ${next.label}`}
              style={styles.chip}
              onPress={() => setSelected(next)}
            >
              <Text variant="label">Next</Text>
            </Pressable>
          ) : null}
        </Row>
        {selected ? (
          <Stack gap="16" testID={`state-view-${selected.screen}`}>
            <Text variant="h3" accessibilityRole="header">
              {`${selected.screen} · ${selected.label}`}
            </Text>
            <ThemeProvider fontScale={settings.fontScale} contrast={settings.contrast}>
              {selected.fixtures.map((ref) => {
                const fixture = fixturesFor(ref.component).find((it) => it.state === ref.state);
                return (
                  <Stack key={`${ref.component}/${ref.state}`} gap="8">
                    <Text variant="eyebrow">{`${ref.component} · ${ref.state}`}</Text>
                    <Stack style={styles.frame}>{fixture?.render()}</Stack>
                  </Stack>
                );
              })}
            </ThemeProvider>
          </Stack>
        ) : null}
        {STATE_GROUPS.map((group) => (
          <Stack key={group.title} gap="6">
            <Text variant="eyebrow">{group.title}</Text>
            <Row gap="8" wrap>
              {group.states.map((state) => (
                <StateChip
                  key={state.screen}
                  state={state}
                  selected={state.screen === selected?.screen}
                  onPress={() => setSelected(state)}
                />
              ))}
            </Row>
          </Stack>
        ))}
      </ScrollView>
    </Scaffold>
  );
}
