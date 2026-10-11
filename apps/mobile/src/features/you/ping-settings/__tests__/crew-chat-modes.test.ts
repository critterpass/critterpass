import { describe, expect, it } from '@jest/globals';

import { crewChatModes, queuedLevels } from '../crew-chat-modes';

const envelope = (crewId: string, level: string) =>
  JSON.stringify({ cmd: 'set_crew_notify', payload: { crew_id: crewId, level } });

describe('chat pings per crew', () => {
  it('shows the chosen level, else the default the server applies for the crew size', () => {
    const modes = crewChatModes(
      [
        { crew_id: 'bali', name: 'The Bali Six', notify_level: null, size: 6 },
        { crew_id: 'kyoto', name: 'Kyoto', notify_level: 'mentions', size: 3 },
        { crew_id: 'big', name: 'Big crew', notify_level: null, size: 40 },
      ],
      new Map(),
    );
    expect(modes.map((mode) => [mode.crewId, mode.byDefault])).toEqual([
      ['bali', true],
      ['kyoto', false],
      ['big', true],
    ]);
    expect(modes[1]?.level).toBe('mentions');
    expect(modes[0]?.level).not.toBe(modes[2]?.level);
  });

  it('puts the newest queued change over the synced row and ignores bad envelopes', () => {
    const queued = queuedLevels([
      envelope('kyoto', 'all'),
      'not json',
      envelope('kyoto', 'off'),
      envelope('lisbon', 'loud'),
    ]);
    expect([...queued]).toEqual([['kyoto', 'off']]);
    const [kyoto] = crewChatModes(
      [{ crew_id: 'kyoto', name: 'Kyoto', notify_level: 'mentions', size: 3 }],
      queued,
    );
    expect(kyoto).toMatchObject({ level: 'off', byDefault: false });
  });
});
