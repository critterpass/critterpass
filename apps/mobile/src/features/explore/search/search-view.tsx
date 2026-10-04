/**
 * The search screen's frame (7d-1…7d-4, 7i-2): the offline banner when there is no signal, the
 * field with Cancel, the scope it searches in, and the body for what was typed. Props only, so the
 * (dev) lab shows each state with fixture data.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles, Scaffold, Text, useTheme } from '@/ui';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';

import { SearchHeader, type SearchHeaderProps } from './search-header';

const useStyles = makeStyles((th) => ({
  top: { paddingHorizontal: th.size.gutter, paddingTop: th.space['10'], gap: th.space['10'] },
  body: {
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['14'],
    paddingBottom: th.space['32'],
    gap: th.space['20'],
  },
}));

export interface SearchViewProps {
  readonly header: SearchHeaderProps;
  /** "DAY 3 · WED", "NEAR TIRTA EMPUL", "IN THIS AREA"; none for the whole destination. */
  readonly scope: string | null;
  readonly banner?: ReactNode;
  readonly children: ReactNode;
  /** A sheet over the screen (drop a pin). */
  readonly overlay?: ReactNode;
}

export function SearchView({ header, scope, banner, children, overlay }: SearchViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold testID="search-screen">
      <View style={styles.top}>
        {banner}
        <SearchHeader {...header} />
        {scope === null ? null : (
          <Text variant="eyebrow" color={theme.semantic.text.secondary} testID="search-scope">
            {scope}
          </Text>
        )}
      </View>
      <KeyboardScrollView contentContainerStyle={styles.body}>{children}</KeyboardScrollView>
      {overlay}
    </Scaffold>
  );
}
