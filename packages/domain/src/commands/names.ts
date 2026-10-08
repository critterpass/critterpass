/**
 * Every command the api registers on the registry its three doors resolve against
 * (docs/api-contracts.md §2.2), sorted by name. The app types the names it sends with this list,
 * and the api checks its registry against it in both directions, so a name the server does not
 * know fails to compile and a command missing here fails the api's suite. Adding a command means
 * adding its name here. The ops console's commands run through their own pipeline and are not
 * listed.
 */
import { COMMAND_NAMES_A_TO_O } from './names-a-to-o';
import { COMMAND_NAMES_P_TO_Z } from './names-p-to-z';

export const COMMAND_NAMES = [...COMMAND_NAMES_A_TO_O, ...COMMAND_NAMES_P_TO_Z] as const;

export type RegisteredCommandName = (typeof COMMAND_NAMES)[number];
