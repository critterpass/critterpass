import { Row } from '../layout/Row';
import { Tag } from '../plan/ActionPill';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface BillingOption<Value extends string> {
  readonly value: Value;
  /** "Monthly". */
  readonly label: string;
  /** Store-localised price ("$3.99"). */
  readonly price: string;
  /** Discount badge ("−37%"). */
  readonly badge?: string;
}

export interface BillingToggleProps<Value extends string> {
  readonly options: readonly BillingOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  track: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['4'],
  },
  segment: {
    flex: 1,
    borderRadius: th.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: th.space['10'],
    paddingHorizontal: th.space['6'],
  },
  // One line while it fits; a long price (a dong amount) or a large text size wraps under the
  // label, centred, and the badge follows it.
  words: { flexShrink: 1, textAlign: 'center' },
}));

/** Monthly / yearly switch with prices and the discount badge. */
export function BillingToggle<Value extends string>({
  options,
  value,
  onChange,
  testID,
}: BillingToggleProps<Value>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row style={styles.track} testID={testID} accessibilityRole="radiogroup">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <PressScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={[option.label, option.price, option.badge]
              .filter(Boolean)
              .join(', ')}
            accessibilityState={{ checked }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, checked ? { backgroundColor: theme.color.paper.base } : null]}
          >
            <Row gap="6" align="center" justify="center" wrap>
              <Text
                variant="label"
                style={styles.words}
                color={checked ? theme.color.paper.ink : theme.semantic.text.secondary}
              >
                {`${option.label} · ${option.price}`}
              </Text>
              {option.badge ? (
                <Tag label={option.badge} color={theme.semantic.state.urgent} />
              ) : null}
            </Row>
          </PressScale>
        );
      })}
    </Row>
  );
}
