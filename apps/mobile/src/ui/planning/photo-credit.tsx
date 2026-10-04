/**
 * The credit a screen owes the sources of the photos it shows (undesigned): one quiet caption line,
 * drawn once per screen however many photos share the source ("Powered by Foursquare"). Nothing
 * when no photo on the screen asks for one. Over a map or a photo it sits on a small base-colour
 * plate so it stays readable.
 */
import { View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';

const CREDIT_SEPARATOR = ' · ';

const useStyles = makeStyles((t) => ({
  line: { flexDirection: 'row' },
  plate: {
    backgroundColor: t.semantic.bg.base,
    borderRadius: t.radius.xs,
    paddingHorizontal: t.space['6'],
    opacity: 0.85,
  },
}));

export interface PhotoCreditProps {
  /** The distinct credits owed (`screenCredits`); nothing is drawn for none. */
  readonly credits: readonly string[];
  /** Over a map or a photo: the line sits on a plate. @default false */
  readonly plate?: boolean;
  /** @default 'start' */
  readonly align?: 'start' | 'center' | 'end';
  readonly testID?: string;
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' } as const;

export function PhotoCredit({
  credits,
  plate = false,
  align = 'start',
  testID = 'photo-credit',
}: PhotoCreditProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (credits.length === 0) return null;
  return (
    <View style={[styles.line, { justifyContent: JUSTIFY[align] }]} pointerEvents="none">
      <Text
        variant="caption"
        color={theme.semantic.text.secondary}
        style={plate ? styles.plate : undefined}
        testID={testID}
      >
        {credits.join(CREDIT_SEPARATOR)}
      </Text>
    </View>
  );
}
