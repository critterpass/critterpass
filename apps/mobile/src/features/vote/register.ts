/**
 * The vote area's registrations into other areas, imported once by the root layout: the poll card
 * and the "+" Poll entry in crew chat, the poll inbox cards, and the vote screens in the
 * navigation registry.
 */
import { registerPollInboxRenderers } from './inbox-renderers';
import { registerPollChatCards } from './register-chat-cards';
import { registerVoteScreens } from './routes';

registerPollChatCards();
registerPollInboxRenderers();
registerVoteScreens();
