import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

export type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Binds `makeStyles((t) => ({...}))` to a theme hook. `lib` cannot import `@cp/design-tokens`
 * (tools/lint/boundaries.js), so the token-backed theme is built in `src/ui/theme.ts` and passed in
 * here. Each style sheet is created once per theme object (themes are memoised per contrast mode),
 * so re-renders never re-run `StyleSheet.create`.
 */
export function createMakeStyles<Theme extends object>(useTheme: () => Theme) {
  return function makeStyles<T extends NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
    const cache = new WeakMap<Theme, T>();
    return function useStyles(): T {
      const theme = useTheme();
      const cached = cache.get(theme);
      if (cached) return cached;
      const created = StyleSheet.create(factory(theme));
      cache.set(theme, created);
      return created;
    };
  };
}
