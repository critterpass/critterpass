/** "Why this estimate": the basis of our fare range, its sources and when it was checked. */
import { useLingui } from '@lingui/react/macro';
import { Linking } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { FareSource } from './fare-estimate';

export interface EstimateSheetProps {
  readonly basis: string;
  readonly sources: readonly FareSource[];
  /** Already formatted for the reader. */
  readonly checked: string | null;
  readonly reviewed: boolean;
}

export function EstimateSheet({ basis, sources, checked, reviewed }: EstimateSheetProps) {
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Stack gap="14" testID="supplier-estimate-why">
      <Text variant="body">{basis}</Text>
      {sources.length > 0 ? (
        <Stack gap="6">
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {t({ id: 'suppliers.estimate.sources', message: 'SOURCES' })}
          </Text>
          {sources.map((source) =>
            source.url ? (
              <TextLink
                key={source.name}
                label={source.name}
                onPress={() => void Linking.openURL(source.url ?? '')}
              />
            ) : (
              <Text key={source.name} variant="bodySm">
                {source.name}
              </Text>
            ),
          )}
        </Stack>
      ) : null}
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {reviewed
          ? t({
              id: 'suppliers.estimate.reviewed',
              message: 'Checked by our team. Drivers and meters can differ.',
            })
          : t({
              id: 'suppliers.estimate.computed',
              message:
                'Worked out from these sources, not checked by a person yet. Drivers and meters can differ.',
            })}
        {checked
          ? ` ${t({ id: 'suppliers.estimate.checked', message: `Last checked ${checked}.` })}`
          : ''}
      </Text>
    </Stack>
  );
}
