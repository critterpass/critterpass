/** The "Why am I seeing this?" sheet for a sponsored pick, opened over the list it sits in. */
import { router } from 'expo-router';

import { WhySponsoredSheet } from '../components/why-sponsored-sheet';
import { exploreRoutes } from '../routes';
import { partnerName } from '../sponsored-model';

export function WhySponsoredScreen(props: { readonly partner: string; readonly place: string }) {
  const passPlus = exploreRoutes.passPlus();
  return (
    <WhySponsoredSheet
      partner={partnerName(props.partner)}
      place={props.place}
      onPassPlus={passPlus === undefined ? undefined : () => router.replace(passPlus)}
    />
  );
}
