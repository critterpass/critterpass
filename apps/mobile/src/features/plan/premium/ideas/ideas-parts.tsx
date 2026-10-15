/** Pieces of the Ideas sheet (4.40): Android's drawn grabber and the must-do banner. */
import { t } from '@lingui/core/macro';
import { Platform, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

export const STARRED = '★';

/** iOS draws the form sheet's grabber; Android's sheet has none, so it is drawn here. */
export function AndroidGrabber() {
  const theme = usePremiumTheme();
  if (Platform.OS !== 'android') return null;
  return (
    <View
      style={{
        alignSelf: 'center',
        width: 36,
        height: 5,
        borderRadius: theme.radius.progressStep,
        backgroundColor: theme.color.outlineEmpty,
      }}
    />
  );
}

/** "Must-dos: star one each. 2 of 5 starred" on the guide's gold. */
export function MustDoBanner({
  starred,
  total,
}: {
  readonly starred: number;
  readonly total: number;
}) {
  const theme = usePremiumTheme();
  return (
    <View
      testID="ideas-must-do-banner"
      style={{
        borderRadius: 18,
        backgroundColor: theme.color.banner.guide.bg,
        paddingVertical: theme.space.gap10,
        paddingHorizontal: theme.space.gap12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap10,
      }}
    >
      <Text variant="headline" color={theme.color.guideName}>
        {STARRED}
      </Text>
      <Text variant="note" color={theme.color.banner.guide.text} style={{ flex: 1 }}>
        <Text variant="bannerAction" color={theme.color.banner.guide.text}>
          {t({ id: 'plan.premium.ideas.mustDoLead', message: 'Must-dos: star one each.' })}
        </Text>
        {` ${t({
          id: 'plan.premium.ideas.starred',
          message: `${starred} of ${total} starred`,
        })}`}
      </Text>
    </View>
  );
}
