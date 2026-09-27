import { Stack } from '../layout/Stack';
import { Icon } from '../icons/Icon';
import { PressScale } from '../press/PressScale';
import { SecondaryText } from '../cards/SecondaryText';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface LanguageRowProps {
  /** BCP 47 code ("vi"), so screen readers pronounce the native name in its own language. */
  readonly locale: string;
  /** The language's own name ("Tiếng Việt"). */
  readonly nativeName: string;
  /** Its name in the current app language ("Vietnamese"). */
  readonly localName: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: MIN_TOUCH_TARGET + t.space['12'],
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['10'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
  },
}));

/** One language choice (3n-8): native name, local name, check when selected; a radio for a11y. */
export function LanguageRow({
  locale,
  nativeName,
  localName,
  selected,
  onSelect,
  testID,
}: LanguageRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      testID={testID}
      onPress={onSelect}
      widthClass="wide"
      accessibilityRole="radio"
      accessibilityLabel={`${nativeName}, ${localName}`}
      accessibilityState={{ checked: selected }}
      style={styles.row}
    >
      <Stack gap="2" flex={1}>
        <Text variant="rowTitle" accessibilityLanguage={locale}>
          {nativeName}
        </Text>
        <SecondaryText>{localName}</SecondaryText>
      </Stack>
      {selected ? (
        <Icon name="check" size={20} color={theme.semantic.action.primary} decorative />
      ) : null}
    </PressScale>
  );
}
