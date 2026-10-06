/** The terms and privacy pages every purchase surface links to. */
/* eslint-disable lingui/no-unlocalized-strings -- URLs, never copy. */
import { Linking } from 'react-native';

export const TERMS_URL = 'https://critterpass.app/legal/terms';
export const PRIVACY_URL = 'https://critterpass.app/legal/privacy';

export function openTerms(): void {
  void Linking.openURL(TERMS_URL);
}

export function openPrivacy(): void {
  void Linking.openURL(PRIVACY_URL);
}
