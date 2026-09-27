import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Stack } from '../layout/Stack';
import { makeStyles, useTheme } from '../theme';
import { TextField } from './TextField';

export interface SearchFieldProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** Placeholder and accessible name, e.g. "Search places". */
  readonly label?: string;
  readonly onSubmit?: () => void;
  /** Result rows rendered under the field while it has a query. */
  readonly results?: ReactNode;
  readonly autoFocus?: boolean;
  readonly testID?: string;
}

const HANDLE_ANGLE_DEG = 45;

const useStyles = makeStyles((t) => ({
  lens: { width: 18, height: 18, marginEnd: t.space['8'] },
  ring: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: t.semantic.text.secondary,
  },
  handle: {
    position: 'absolute',
    width: 7,
    height: 2.5,
    borderRadius: 1.25,
    end: 0,
    bottom: 2,
    transform: [{ rotate: `${HANDLE_ANGLE_DEG}deg` }],
    backgroundColor: t.semantic.text.secondary,
  },
}));

function Lens() {
  const styles = useStyles();
  return (
    <View
      style={styles.lens}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.ring} />
      <View style={styles.handle} />
    </View>
  );
}

/** Search input with a lens, clear button and a results slot under it. */
export function SearchField({
  value,
  onChangeText,
  label,
  onSubmit,
  results,
  autoFocus,
  testID,
}: SearchFieldProps) {
  const theme = useTheme();
  const name = label ?? t({ id: 'common.search.label', message: 'Search' });
  return (
    <Stack gap="8">
      <TextField
        label={name}
        labelHidden
        value={value}
        onChangeText={onChangeText}
        leading={<Lens />}
        placeholder={name}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityRole="search"
        {...(onSubmit ? { onSubmitEditing: onSubmit } : {})}
        {...(autoFocus !== undefined ? { autoFocus } : {})}
        {...(testID ? { testID } : {})}
      />
      {value.length > 0 && results ? (
        <View style={{ gap: theme.space['8'] }}>{results}</View>
      ) : null}
    </Stack>
  );
}
