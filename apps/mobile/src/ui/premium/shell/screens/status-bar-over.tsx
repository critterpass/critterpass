/**
 * Light status bar content over a dark surface under the status bar (a hub photo, the paywall's
 * night hero), only while the page is the one on screen: a page pushed over it, or the page
 * scrolled past its photo, goes back to the theme's own status bar.
 */
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'react-native';

export function StatusBarOver({ dark }: { readonly dark: boolean }) {
  const focused = useIsFocused();
  if (!focused || !dark) return null;
  return <StatusBar barStyle="light-content" animated />;
}
