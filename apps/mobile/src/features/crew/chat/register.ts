/**
 * Crew chat's registrations into other areas, imported once by the root layout: the unread badge
 * on each crew card of the crews sheet.
 */
import { registerCrewCardBadge } from '../crews-sheet/badge-slot';
import { UnreadBadge } from './components/unread-badge';

registerCrewCardBadge(UnreadBadge);
