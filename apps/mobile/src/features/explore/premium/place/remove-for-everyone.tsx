/**
 * "Remove for everyone" on the place page (undesigned in the premium set; a text button and the
 * system alert): an organiser takes a place out of the trip's Ideas for the whole crew, after a
 * confirm that names the place. It shows only while a crewmate's save keeps the place in Ideas;
 * the ♡ only ever takes back the organiser's own save.
 */
import { useLingui } from '@lingui/react/macro';

import { TextButton } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { useRemoveForEveryone } from '../../place-detail/use-remove-for-everyone';

export function PremiumRemoveForEveryone(props: {
  readonly tripId: string | null;
  readonly placeId: string;
  readonly name: string;
  readonly organiser: boolean;
}) {
  const { t } = useLingui();
  const offer = useRemoveForEveryone(props);
  if (offer === null) return null;
  const { savers } = offer;
  const name = props.name;
  const ask = async () => {
    if (offer.pending) return;
    const yes = await confirmAlert({
      title: t({ id: 'explore.detail.removeAll.title', message: `Remove ${name} for everyone?` }),
      message: t({
        id: 'explore.detail.removeAll.body',
        message: `It leaves Ideas for the whole crew. ${savers} of you saved it.`,
      }),
      confirm: t({ id: 'explore.detail.removeAll.confirm', message: 'Remove' }),
      cancel: t({ id: 'common.confirm.cancel', message: 'Cancel' }),
    });
    if (yes) offer.remove();
  };
  return (
    <TextButton
      label={t({ id: 'explore.detail.removeAll.link', message: 'Remove from Ideas for everyone' })}
      onPress={() => void ask()}
      align="center"
      testID="place-detail-remove-everyone"
    />
  );
}
