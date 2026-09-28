/**
 * The share-sheet relay (docs/product-decisions.md, nudges): a crewmate who never installed the app
 * is never messaged by us. The sender gets the guide's line and the invite link, and shares them
 * from their own phone, through whichever app they choose.
 */
import { Share } from 'react-native';

export interface RelayMessage {
  readonly text: string;
  readonly url: string | null;
}

/** Opens the OS share sheet; resolves false when the sender backed out. */
export async function shareRelay(message: RelayMessage): Promise<boolean> {
  try {
    const result = await Share.share(
      message.url === null
        ? { message: message.text }
        : { message: message.text, url: message.url },
    );
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
