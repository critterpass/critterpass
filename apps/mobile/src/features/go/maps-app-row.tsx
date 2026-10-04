/**
 * The Settings row for which maps app Start opens (iPhone only: Android always hands off to Google
 * Maps, so there is nothing to choose there). Kept on this phone, like the sound settings.
 */
import { useLingui } from '@lingui/react/macro';
import { View, type ViewStyle } from 'react-native';

import type { SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Segmented } from '@/ui/inputs/Segmented';

import type { MapsApp } from './maps-handoff';

const TRACK: ViewStyle = { flexShrink: 1, maxWidth: '64%' };

/** Null where there is no choice to make (`value` null). */
export function useMapsAppRow(
  value: MapsApp | null,
  onChange: (next: MapsApp) => void,
): SettingsRow | null {
  const { t } = useLingui();
  if (value === null) return null;
  const title = t({ id: 'go.settings.mapsApp', message: 'Directions in' });
  return {
    key: 'maps-app',
    kind: 'custom',
    title,
    trailing: (
      <View style={TRACK}>
        <Segmented
          segments={[
            { value: 'apple', label: t({ id: 'go.settings.appleMaps', message: 'Apple Maps' }) },
            { value: 'google', label: t({ id: 'go.settings.googleMaps', message: 'Google Maps' }) },
          ]}
          value={value}
          onChange={onChange}
          label={title}
          testID="you-settings-maps-app"
        />
      </View>
    ),
  };
}
