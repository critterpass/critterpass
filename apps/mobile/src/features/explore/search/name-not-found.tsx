/**
 * Under the field when no place has the name typed (7d-1, undesigned): words, and the two ways on
 * that the empty answer to a question also offers: drop a pin for a place the guide does not know
 * yet, or take the name to the guide's chat.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

const useStyles = makeStyles((th) => ({
  card: {
    gap: th.space['10'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['10'] },
}));

export interface NameNotFoundProps {
  /** What she typed, for the title; absent says "that". */
  readonly typed?: string | undefined;
  /** The text read like a street address. */
  readonly address?: boolean | undefined;
  readonly guideName: string;
  readonly onDropPin: () => void;
  readonly onAsk: () => void;
}

export function NameNotFound({ typed, address, guideName, onDropPin, onAsk }: NameNotFoundProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.card} testID="search-name-none">
      <Text variant="title" singleLine={false}>
        {address === true
          ? t({ id: 'search.name.noneAddress', message: 'Nothing found at that address' })
          : typed === undefined || typed === ''
            ? t({ id: 'search.name.none', message: 'No place called that' })
            : t({ id: 'search.name.noneNamed', message: `No place called “${typed}”` })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {address === true
          ? t({
              id: 'search.name.noneAddressLine',
              message: `Drop a pin where it is, or ask ${guideName} to look for it.`,
            })
          : t({
              id: 'search.name.noneLine',
              message: `Check the spelling, drop a pin where it is, or ask ${guideName} to look for it.`,
            })}
      </Text>
      <View style={styles.actions}>
        <PillButton
          label={t({ id: 'search.none.pin', message: 'Drop a pin' })}
          size="sm"
          tone="ink"
          onPress={onDropPin}
          testID="search-name-none-pin"
        />
        <PillButton
          label={t({ id: 'search.name.ask', message: `Ask ${guideName}` })}
          size="sm"
          onPress={onAsk}
          testID="search-name-none-ask"
        />
      </View>
    </View>
  );
}
