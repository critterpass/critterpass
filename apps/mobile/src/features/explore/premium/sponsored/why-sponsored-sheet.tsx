/**
 * "Why am I seeing this?" for a sponsored pick, as the premium form sheet over the list it sits
 * in: who paid for the spot, that it is there because of the place being looked at and never
 * because of who is looking, that the guide's own picks are never ranked by payment, and that
 * Pass+ removes sponsored picks. Close on the left; nothing to keep, so no verb.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { exploreRoutes } from '../../routes';
import { partnerName } from '../../sponsored-model';

export function PremiumWhySponsoredSheet(props: {
  readonly partner: string;
  readonly place: string;
}) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const partner = partnerName(props.partner);
  const place = props.place;
  const passPlus = exploreRoutes.passPlus();
  const lines = [
    t({
      id: 'explore.sponsored.paid',
      message: `${partner} paid for this spot in the list. It is marked SPONSORED so you can tell it from the guide's own picks.`,
    }),
    t({
      id: 'explore.sponsored.contextual',
      message: `You see it because you're looking at ${place}. It isn't chosen from anything about you, and we don't track you for it.`,
    }),
    t({
      id: 'explore.sponsored.neutral',
      message:
        'The guide’s picks are never ranked by what a partner pays. We may earn a commission if you book through a partner.',
    }),
    t({
      id: 'explore.sponsored.passPlus',
      message: 'Pass+ and boosted trips have no sponsored picks.',
    }),
  ];
  return (
    <SheetScreen
      title={t({ id: 'explore.sponsored.sheetTitle', message: 'Why am I seeing this?' })}
      cancelLabel={t({ id: 'explore.premium.sponsored.close', message: 'Close' })}
      testID="explore-sponsored-sheet"
    >
      <View
        style={{
          gap: theme.space.gap12,
          paddingHorizontal: theme.space.gutter,
          paddingTop: theme.space.gap8,
          paddingBottom: theme.space.gap16,
        }}
      >
        {lines.map((line) => (
          <Text key={line} variant="body" tone="inkSecondary">
            {line}
          </Text>
        ))}
        {passPlus === undefined ? null : (
          <Button
            label={t({ id: 'explore.sponsored.seePassPlus', message: 'See Pass+' })}
            variant="secondary"
            onPress={() => router.replace(passPlus)}
            testID="explore-sponsored-pass-plus"
          />
        )}
      </View>
    </SheetScreen>
  );
}
