import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useDeal } from '@/motion/patterns/deal';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill, Tag } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface ParsedBookingCardProps {
  /** "Kura Kura fast boat". */
  readonly title: string;
  /** Parsed fields in reading order ("Fri Oct 16", "Sanur → Penida", "6 seats", "$228"). */
  readonly fields: readonly string[];
  /** Where it was found ("From Alex's email"). */
  readonly source?: string;
  /** Split toggle ("Split 6 ways"). */
  readonly split?: { readonly label: string; readonly on: boolean; readonly onToggle: () => void };
  readonly addLabel: string;
  readonly onAdd: () => void;
  readonly ignoreLabel?: string;
  readonly onIgnore?: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  switch: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  track: {
    width: th.size.toggle.width,
    height: th.size.toggle.height,
    borderRadius: th.size.toggle.height,
    padding: (sizeToken(th.size.toggle, 'height') - sizeToken(th.size.toggle, 'knob')) / 2,
  },
  knob: {
    width: th.size.toggle.knob,
    height: th.size.toggle.knob,
    borderRadius: th.size.toggle.knob,
    backgroundColor: th.color.paper.base,
  },
}));

function Field({ text, index }: { readonly text: string; readonly index: number }) {
  const style = useDeal({ active: true, index });
  return (
    <Animated.View style={style}>
      <Text variant="bodySm">{text}</Text>
    </Animated.View>
  );
}

/** A booking the guide read from an email: fields deal in one by one, split toggle, add or ignore. */
export function ParsedBookingCard({
  title,
  fields,
  source,
  split,
  addLabel,
  onAdd,
  ignoreLabel,
  onIgnore,
  testID,
}: ParsedBookingCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={testID}>
      <Stack
        gap="4"
        accessible
        accessibilityRole="text"
        accessibilityLabel={[title, ...fields, source].filter(Boolean).join(', ')}
      >
        <Text variant="title">{title}</Text>
        <Row gap="6" wrap>
          {fields.map((field, index) => (
            <Field key={`${index}${field}`} text={field} index={index} />
          ))}
        </Row>
        {source ? <Tag label={source} color={theme.semantic.state.info} /> : null}
      </Stack>
      <Row justify="space-between" align="center" gap="8">
        {split ? (
          <PressScale
            accessibilityRole="switch"
            accessibilityLabel={split.label}
            accessibilityState={{ checked: split.on }}
            onPress={split.onToggle}
            widthClass="narrow"
            style={styles.switch}
          >
            <View
              style={[
                styles.track,
                {
                  backgroundColor: split.on
                    ? theme.semantic.state.success
                    : theme.semantic.border.decorative,
                  alignItems: split.on ? 'flex-end' : 'flex-start',
                },
              ]}
            >
              <View style={styles.knob} />
            </View>
            <Text variant="bodySm">{split.label}</Text>
          </PressScale>
        ) : (
          <View />
        )}
        <Row gap="6">
          {ignoreLabel && onIgnore ? (
            <ActionPill tone="outline" label={ignoreLabel} onPress={onIgnore} />
          ) : null}
          <ActionPill
            tone="primary"
            label={addLabel}
            accessibilityLabel={`${addLabel}, ${title}`}
            onPress={onAdd}
          />
        </Row>
      </Row>
    </Stack>
  );
}
