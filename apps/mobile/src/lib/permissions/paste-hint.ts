/**
 * Whether the "allow pasting in Settings" hint has been shown on this install. iOS asks "Allow
 * Paste" on every tap of a drawn paste control until the person allows it in Settings, so after a
 * paste the hint says where, once; a refused paste always says it.
 */
import { createMMKV } from 'react-native-mmkv';

const KEY = 'shown';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-paste-hint' }));

export function pasteHintShown(): boolean {
  try {
    return store().getBoolean(KEY) === true;
  } catch {
    return false;
  }
}

export function markPasteHintShown(): void {
  try {
    store().set(KEY, true);
  } catch {
    // The hint shows again next time; nothing else depends on it.
  }
}
