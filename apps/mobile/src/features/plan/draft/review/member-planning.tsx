/**
 * What a crew member sees where the draft would be: that an organiser is planning, and nothing of
 * the draft itself (the server never sends it to them). Undesigned: the empty-state pattern with
 * the guide asleep.
 */
import { plural, t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { format } from '@cp/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';

import type { DraftTrip } from '../data/draft-trip';

// Centred in the screen like the other drafting outcome states.
const styles = StyleSheet.create({ centre: { flex: 1, justifyContent: 'center' } });

export function MemberPlanning({
  trip,
  onBack,
}: {
  readonly trip: DraftTrip;
  readonly onBack: () => void;
}) {
  const locale = useLocale();
  const info = GUIDE_STICKERS[trip.guide];
  const names = format.list(
    locale,
    trip.organisers.map((p) => p.name),
  );
  const count = trip.organisers.length;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="draft-member">
      <View style={styles.centre}>
        <EmptyState
          guide={trip.guide}
          guideName={info.name}
          sticker={<Sticker kind={info.kind} name={info.name} pose="sleep" size={120} />}
          title={t({
            id: 'planDraft.member.title',
            message: plural(count, { one: `${names} is planning`, other: `${names} are planning` }),
          })}
          line={t({
            id: 'planDraft.member.line',
            message: 'You’ll see the plan as soon as it’s sent to the crew.',
          })}
          action={{
            label: t({ id: 'planDraft.member.back', message: 'Back to the trip' }),
            onPress: onBack,
          }}
        />
      </View>
    </Scaffold>
  );
}
