/**
 * Crew chat's registrations into other areas, imported once by the root layout: each crew card of
 * the crews sheet reads its unread count and last message through these hooks.
 */
import { registerCrewCardChat } from '../crews-sheet/badge-slot';
import { useLastMessage } from './data/use-last-message';
import { useUnreadCount } from './data/use-unread-count';

registerCrewCardChat({ useUnread: (crewId) => useUnreadCount(crewId), useLastMessage });
