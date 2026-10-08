/**
 * The organiser's pick for a tied final spot (undesigned, built from the sheet and settings rows):
 * the places level for the last spot, one row each; picking one starts the final with it.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { BoardPlace } from '../data/use-board';
import type { PollOptionView } from '../data/poll-view';

const useStyles = makeStyles((th) => ({ body: { padding: th.space['16'], gap: th.space['12'] } }));

export function PickFinalistsSheet({
  options,
  places,
  onPick,
  onClose,
}: {
  readonly options: readonly PollOptionView[];
  readonly places: ReadonlyMap<string, BoardPlace>;
  readonly onPick: (optionId: string) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={t({ id: 'vote.pick.title', message: 'Pick the last finalist' })}
      testID="pick-finalist"
    >
      <View style={styles.body}>
        <Text variant="h3" accessibilityRole="header">
          {t({ id: 'vote.pick.title', message: 'Pick the last finalist' })}
        </Text>
        <Text variant="body">
          {t({
            id: 'vote.pick.body',
            message:
              "These places are level for the last spot. You're the organiser, so it's your call.",
          })}
        </Text>
        <SettingsGroup
          testID="pick-finalist-list"
          rows={options.map((option) => {
            const votes = option.votes;
            return {
              key: option.id,
              kind: 'value' as const,
              title:
                (option.refId === null ? undefined : places.get(option.refId)?.name) ??
                option.label,
              value: t({
                id: 'vote.pick.votes',
                message: plural(votes, { one: '# vote', other: '# votes' }),
              }),
              onPress: () => onPick(option.id),
            };
          })}
        />
      </View>
    </Sheet>
  );
}
