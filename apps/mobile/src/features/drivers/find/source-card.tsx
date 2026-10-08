/** One way to find a driver (6a-2): a colour card with its doodle, title, one line and an arrow. */
import { Icon } from '@/ui/icons/Icon';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  source: { borderRadius: t.radius.lg, padding: t.space['16'] },
}));

export function SourceCard(props: {
  readonly title: string;
  readonly body: string;
  readonly color: string;
  readonly icon: 'ticket' | 'chat' | 'car';
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      accessibilityLabel={`${props.title}, ${props.body}`}
      onPress={props.onPress}
      widthClass="wide"
      style={[styles.source, { backgroundColor: props.color }]}
      testID={props.testID}
    >
      <Row gap="12" align="center">
        <Icon name={props.icon} size={28} color={theme.color.ink['950']} decorative />
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="title" color={theme.color.ink['950']}>
            {props.title}
          </Text>
          <Text variant="bodySm" color={theme.color.ink['950']}>
            {props.body}
          </Text>
        </Stack>
        <StraightArrow direction="forward" color={theme.color.ink['950']} />
      </Row>
    </PressScale>
  );
}
