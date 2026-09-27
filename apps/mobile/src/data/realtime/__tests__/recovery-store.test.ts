import { describe, expect, it } from '@jest/globals';
import { createMMKV } from 'react-native-mmkv';

import { createRecoveryStore } from '../recovery-store';

describe('createRecoveryStore', () => {
  it('keeps positions in MMKV, so a store built after a restart reads them back', () => {
    const storage = createMMKV({ id: 'cp-realtime-restart' });
    createRecoveryStore(storage).set('crew:c1', { offset: 42, epoch: 'abcd' });

    const afterRestart = createRecoveryStore(storage);
    expect(afterRestart.get('crew:c1')).toEqual({ offset: 42, epoch: 'abcd' });
    expect(afterRestart.get('crew:c2')).toBeUndefined();
  });

  it('overwrites a channel position and removes it on request', () => {
    const store = createRecoveryStore(createMMKV({ id: 'cp-realtime-overwrite' }));
    store.set('user:#u1', { offset: 1, epoch: 'e1' });
    store.set('user:#u1', { offset: 7, epoch: 'e2' });
    expect(store.get('user:#u1')).toEqual({ offset: 7, epoch: 'e2' });
    store.remove('user:#u1');
    expect(store.get('user:#u1')).toBeUndefined();
  });

  it('clears only its own keys, leaving other values in the same storage', () => {
    const storage = createMMKV({ id: 'cp-realtime-clear' });
    storage.set('unrelated', 'keep');
    const store = createRecoveryStore(storage);
    store.set('crew:c1', { offset: 1, epoch: 'e' });
    store.set('trip:t1', { offset: 2, epoch: 'e' });
    store.clear();
    expect(store.get('crew:c1')).toBeUndefined();
    expect(store.get('trip:t1')).toBeUndefined();
    expect(storage.getString('unrelated')).toBe('keep');
  });

  it('ignores a corrupted or foreign value instead of resuming from it', () => {
    const storage = createMMKV({ id: 'cp-realtime-corrupt' });
    storage.set('rt.pos.crew:c1', '{not json');
    storage.set('rt.pos.crew:c2', JSON.stringify({ offset: -1, epoch: 'e' }));
    storage.set('rt.pos.crew:c3', JSON.stringify({ offset: 3 }));
    const store = createRecoveryStore(storage);
    expect(store.get('crew:c1')).toBeUndefined();
    expect(store.get('crew:c2')).toBeUndefined();
    expect(store.get('crew:c3')).toBeUndefined();
  });

  it('opens its own MMKV instance by default', () => {
    const store = createRecoveryStore();
    store.set('crew:c1', { offset: 5, epoch: 'e' });
    expect(store.get('crew:c1')).toEqual({ offset: 5, epoch: 'e' });
  });
});
