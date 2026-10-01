/** Shared pieces of the account screens: a dotted list, and the line shown when something failed. */
import { View } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: t.space['6'] },
  line: { flex: 1 },
  problem: {
    borderRadius: t.radius.md,
    padding: t.space['12'],
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 1,
    borderColor: t.semantic.state.urgent,
  },
}));

export function DotList(props: {
  readonly title: string;
  readonly color: string;
  readonly lines: readonly string[];
}) {
  const styles = useStyles();
  return (
    <Stack gap="8">
      <Text variant="label" color={props.color} accessibilityRole="header">
        {props.title}
      </Text>
      {props.lines.map((line) => (
        <Row key={line} gap="10" align="flex-start">
          <View style={[styles.dot, { backgroundColor: props.color }]} />
          <Text variant="body" style={styles.line}>
            {line}
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

/** What went wrong, said plainly, with what did and did not happen. */
export function Problem({ text, testID }: { readonly text: string; readonly testID: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.problem} accessibilityRole="alert" testID={testID}>
      <Text variant="body" color={theme.semantic.text.primary}>
        {text}
      </Text>
    </View>
  );
}
