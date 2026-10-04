/**
 * The search screens' small store on the phone (MMKV `cp-search`): hashes of the links already
 * imported, so the clipboard card never offers the same post twice, and the plain-words questions
 * asked with no signal, kept until they are sent. Never the post's text or title.
 */

import { createMMKV } from 'react-native-mmkv';

const STORE_ID = 'cp-search';
// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
export const searchStore = () => (storage ??= createMMKV({ id: STORE_ID }));
