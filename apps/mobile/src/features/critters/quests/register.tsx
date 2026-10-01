/**
 * The crew quests' startup hook, imported once by the root layout: the QUESTS tile joins the trip
 * hub after MONEY, and crew quests (3l-7) joins the navigation registry.
 */
import { registerHubTile } from '@/features/trip';

import { QuestsTile } from './QuestsTile';
import { registerQuestScreens } from './routes';

registerQuestScreens();
registerHubTile({ key: 'quests', order: 40, Tile: QuestsTile });
