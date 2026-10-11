/**
 * "Remove for everyone" on the place page: an organiser takes a place out of the trip's Ideas for
 * the whole crew, after a confirm that names the place. It shows only while a crewmate's save
 * keeps the place in Ideas; the ♡ beside it only ever takes back the organiser's own save.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';

import { useRemoveForEveryone } from './use-remove-for-everyone';

const useStyles = makeStyles((th) => ({
  link: { alignItems: 'center' },
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'] },
}));

export interface RemoveForEveryoneProps {
  readonly tripId: string | null;
  readonly placeId: string;
  readonly name: string;
  readonly organiser: boolean;
}

export function RemoveForEveryone({ tripId, placeId, name, organiser }: RemoveForEveryoneProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const [asking, setAsking] = useState(false);
  const offer = useRemoveForEveryone({ tripId, placeId, organiser });
  if (offer === null) return null;
  const { savers, pending } = offer;
  const remove = () => {
    setAsking(false);
    offer.remove();
  };
  const title = t({
    id: 'explore.detail.removeAll.title',
    message: `Remove ${name} for everyone?`,
  });
  return (
    <View style={styles.link}>
      <TextLink
        label={t({
          id: 'explore.detail.removeAll.link',
          message: 'Remove from Ideas for everyone',
        })}
        onPress={() => setAsking(!pending)}
        testID="place-detail-remove-everyone"
      />
      {asking ? (
        <Sheet detents={['fit']} onDismiss={() => setAsking(false)} accessibilityLabel={title}>
          <View style={styles.body}>
            <ConfirmSheet
              title={title}
              consequences={[
                t({
                  id: 'explore.detail.removeAll.body',
                  message: `It leaves Ideas for the whole crew. ${savers} of you saved it.`,
                }),
              ]}
              confirmLabel={t({ id: 'explore.detail.removeAll.confirm', message: 'Remove' })}
              onConfirm={remove}
              onCancel={() => setAsking(false)}
              testID="place-detail-remove-everyone-confirm"
            />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
