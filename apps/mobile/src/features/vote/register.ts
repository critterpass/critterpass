/**
 * The vote area's registrations into other areas, imported once by the root layout: the poll card
 * and the "+" Poll entry in crew chat, Home's destination vote slot, and the vote screens in
 * the navigation registry.
 */
import { registerDestinationVoteSlot } from './board/vote-slot';
import { registerPollChatCards } from './register-chat-cards';
import { registerVoteScreens } from './routes';

registerPollChatCards();
registerDestinationVoteSlot();
registerVoteScreens();
