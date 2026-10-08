import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface TextLinkProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  // The link's own box is the full touch target: that room is its spacing under the pill above.
  target: {
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['12'],
  },
}));

/**
 * A quiet secondary action under a screen's main pill, drawn as plain sentence-case text ("I have
 * an invite code", "Ask me later") with the full 44 pt target around it.
 */
export function TextLink({ label, onPress, disabled = false, testID }: TextLinkProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      widthClass="medium"
      accessibilityLabel={label}
      style={styles.target}
    >
      <Text
        variant="body"
        color={disabled ? theme.semantic.text.tertiary : theme.semantic.text.secondary}
        style={{ textAlign: 'center' }}
      >
        {label}
      </Text>
    </PressScale>
  );
}
