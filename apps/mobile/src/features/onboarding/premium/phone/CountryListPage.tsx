/**
 * The country code picker on the premium phone page (undesigned): an in-page list over the page,
 * with the wizard's back circle to leave it, a search box, and one row per country (its name and
 * calling code, the current one ticked).
 */
import { t } from '@lingui/core/macro';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { countryList } from '../../phone/phone-number';
import { regionName } from '../../region-names';
import { PICKED_ROW } from '../components/onboarding-colours';
import { SearchBox } from '../components/SearchBox';
import { WizardHeader } from '../components/WizardHeader';

export interface CountryListPageProps {
  readonly current: string;
  readonly onPick: (country: string) => void;
  readonly onClose: () => void;
}

export function CountryListPage({ current, onPick, onClose }: CountryListPageProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const all = useMemo(() => countryList(locale, (code) => regionName(code, locale)), [locale]);
  // The filter runs on the deferred query, so a keystroke's render never lags the typed text.
  const q = useDeferredValue(query).trim().toLowerCase();
  const rows =
    q.length === 0
      ? all
      : all.filter(
          (c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q.replace('+', '')),
        );
  const title = t({ id: 'onboarding.phone.country', message: 'Country' });
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="country-picker">
      <WizardHeader
        label=""
        backLabel={t({ id: 'onboarding.phone.back', message: 'Back' })}
        onBack={onClose}
      />
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingTop: theme.space.gap16,
          paddingBottom: theme.space.gap12,
          gap: theme.space.gap12,
        }}
      >
        <Text variant="largeTitle" accessibilityRole="header">
          {title}
        </Text>
        <SearchBox
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'onboarding.phone.countrySearch', message: 'Search countries' })}
          testID="country-search"
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.code}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          marginHorizontal: theme.space.titleGutter,
          marginBottom: Math.max(insets.bottom, theme.space.gap16),
          borderRadius: theme.radius.card,
          backgroundColor: theme.color.card,
          overflow: 'hidden',
        }}
        renderItem={({ item }) => {
          const picked = item.code === current;
          return (
            <PressableScale
              onPress={() => onPick(item.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={`${item.name}, +${item.dial}`}
              pressedScale={0.99}
              testID={`country-${item.code}`}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  paddingVertical: theme.space.gap12,
                  paddingHorizontal: theme.space.rowPadH,
                  backgroundColor: picked && theme.scheme === 'light' ? PICKED_ROW : 'transparent',
                }}
              >
                {/* A long name ("Antigua và Barbuda") wraps beside the calling code. */}
                <Text variant="rowTitle" style={{ flex: 1 }}>
                  {item.name}
                </Text>
                <Text variant="rowText" tone="muted">
                  +{item.dial}
                </Text>
                {picked ? <Icon name="check" size={16} color={theme.color.ink} /> : null}
              </View>
            </PressableScale>
          );
        }}
      />
    </View>
  );
}
