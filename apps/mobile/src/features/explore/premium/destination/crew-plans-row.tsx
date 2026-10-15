/** The destination's row into the crews' shared plans for the place (4.04 "14 crew plans"). */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon, ListCard, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { Doodle } from '../components/doodle';

export function CrewPlansRow(props: { readonly placeName: string; readonly onPress: () => void }) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <ListCard>
      <PressableScale
        onPress={props.onPress}
        accessibilityRole="button"
        testID="explore-crew-plans"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap12,
          padding: theme.space.gap12,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10.8,
            backgroundColor: theme.color.status.tangerine.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Doodle name="ticket" size={30} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle">
            {t({ id: 'explore.premium.find.crewPlans', message: 'Crew plans' })}
          </Text>
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'explore.premium.find.crewPlansLine',
              message: `How other crews did ${props.placeName}`,
            })}
          </Text>
        </View>
        <Icon name="forward" size={16} color={theme.color.placeholder} />
      </PressableScale>
    </ListCard>
  );
}
