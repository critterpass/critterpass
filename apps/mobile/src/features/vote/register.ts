/**
 * The vote area's registrations into other areas, imported once by the root layout: the poll card
 * and the "+" Poll entry in crew chat, Home's destination vote slot, the poll inbox cards, and the
 * vote screens in the navigation registry.
 */
import { registerPollInboxRenderers } from './inbox-renderers';
import { registerDestinationVoteSlot } from './premium/board/vote-slot';
import { registerPollChatCards } from './register-chat-cards';
import { registerVoteScreens } from './routes';

registerPollChatCards();
registerDestinationVoteSlot();
registerPollInboxRenderers();
registerVoteScreens();
