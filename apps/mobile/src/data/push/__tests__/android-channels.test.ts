import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { ANDROID_CHANNELS } from '@cp/domain';

const CHANNELS_KT = path.join(
  __dirname,
  '../../../../modules/cp-notifications/android/src/main/java/app/critterpass/notifications/Channels.kt',
);

describe('Android notification channels', () => {
  it('creates exactly the channels the worker sends to, in the same order', () => {
    const source = readFileSync(CHANNELS_KT, 'utf8');
    const ids = [...source.matchAll(/ChannelSpec\("([a-z_]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual([...ANDROID_CHANNELS]);
  });
});
