/**
 * The paywall's context chip (9.10): what brought the person here, so the offer reads as an answer
 * to that moment ("Your guide's answers for today are used up"). Entries opened by hand show none.
 */
import type { PaywallEntryPoint } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { CritterSticker, Text } from '@/ui/premium';

import { NIGHT, NightGlass } from './components/night';
import { MONETIZE_INK } from './monetize-palette';

function useEntryLine(): (entry: PaywallEntryPoint) => string | null {
  const { t } = useLingui();
  return (entry) => {
    switch (entry) {
      case 'guide_limit':
        return t({ id: 'monetize.premium.entry.guide', message: 'Today’s answers are used up' });
      case 'redraft_last':
        return t({ id: 'monetize.premium.entry.redraft', message: 'Your last free redraft' });
      case 'seat_cap':
        return t({ id: 'monetize.premium.entry.seat', message: 'One seat too many' });
      case 'live_map':
      case 'lock_screen_map':
        return t({ id: 'monetize.premium.entry.liveMap', message: 'The crew’s live map' });
      case 'ftf_ending':
        return t({ id: 'monetize.premium.entry.ftf', message: 'Your free first trip is ending' });
      case 'postcard':
        return t({ id: 'monetize.premium.entry.postcard', message: 'A real postcard in the post' });
      case 'widget_locked':
      case 'widget_gallery':
        return t({ id: 'monetize.premium.entry.widget', message: 'Every widget' });
      case 'boost_card':
      case 'pass_chip':
      case 'plan_page':
        return null;
    }
  };
}

export function EntryChip({ entry }: { readonly entry: PaywallEntryPoint }) {
  const line = useEntryLine()(entry);
  if (line === null) return null;
  return (
    <NightGlass
      style={{
        height: 32,
        borderRadius: 16,
        paddingLeft: 3,
        paddingRight: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: MONETIZE_INK.ponDisc,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <CritterSticker kind="tanuki" name="Pon" size={24} edge={false} />
      </View>
      <Text variant="noteAction" color={NIGHT.textSoft} numberOfLines={1}>
        {line}
      </Text>
    </NightGlass>
  );
}
