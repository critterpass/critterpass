/**
 * "Addresses" under a search's places (7d-1 while typing, 7d-2, and above the ways out on 7d-4;
 * undesigned): street addresses for what was typed, each a pin row. A pick opens DROP A PIN on
 * that spot with the address as its name. The map data's credits sit under the rows, as its terms
 * require. Nothing shows while it loads or when no address is found.
 */
import { t } from '@lingui/core/macro';
import { Linking, View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { PlaceRow } from '@/ui/planning';
import { PressScale } from '@/ui/press/PressScale';

import type { AddressesState, FoundAddress } from './use-addresses';

const useStyles = makeStyles((th) => ({
  section: { gap: th.space['8'] },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  credits: { flexDirection: 'row', flexWrap: 'wrap', columnGap: th.space['12'] },
  credit: { minHeight: 32, justifyContent: 'center' },
}));

export interface AddressSectionProps {
  readonly state: AddressesState;
  readonly onPick: (address: FoundAddress) => void;
}

export function AddressSection({ state, onPick }: AddressSectionProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (state.kind !== 'done' || state.addresses.length === 0) return null;
  return (
    <View style={styles.section} testID="search-addresses">
      <Text variant="eyebrow">{t({ id: 'search.address.eyebrow', message: 'Addresses' })}</Text>
      <View style={styles.card}>
        {state.addresses.map((address, index) => (
          <PlaceRow
            key={`${address.line}-${String(index)}`}
            title={address.line}
            meta={address.rest ?? undefined}
            icon="pin"
            onPress={() => onPick(address)}
            testID={`search-address-${String(index)}`}
          />
        ))}
      </View>
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {t({
          id: 'search.address.hint',
          message: 'Pick one, then move the pin to the exact spot.',
        })}
      </Text>
      {state.credits.length === 0 ? null : (
        <View style={styles.credits}>
          {state.credits.map((credit) => (
            <PressScale
              key={credit.url}
              accessibilityRole="link"
              accessibilityLabel={credit.label}
              onPress={() => void Linking.openURL(credit.url).catch(() => undefined)}
            >
              <View style={styles.credit}>
                <Text variant="caption" color={theme.semantic.text.secondary}>
                  {credit.label}
                </Text>
              </View>
            </PressScale>
          ))}
        </View>
      )}
    </View>
  );
}
