// Joins the proposal screens to the navigation registry, its items to the inbox and its reading of
// whose turn it is to Home's slot, at app start.
import { registerTripTurn } from '@/features/home';

import { registerProposalInboxRenderers } from './inbox-renderers';
import { registerProposalScreens } from './routes';
import { useTripTurnForHome } from './turn/use-trip-turn';

registerProposalScreens();
registerProposalInboxRenderers();
registerTripTurn(useTripTurnForHome);
import './chat-card';
