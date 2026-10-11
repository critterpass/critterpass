/**
 * The sticker tray's rules: one tab per critter met, wearing the form found last, in every sticker
 * pose; the set's critters not met yet as silhouettes; Recent as the last distinct stickers sent,
 * only ones the member can still send; and the dex count.
 */
import { describe, expect, it } from '@jest/globals';

import { buildStickerTray } from '../use-sticker-tray';

const form = (id: string, critter: string, set: string | null) => ({
  form_id: id,
  critter_id: critter,
  critter_key: `cp-${critter}`,
  no: 1,
  name: null,
  species: 'Gecko',
  rarity: 'common',
  palette: null,
  seed: 7,
  set_id: set,
  set_name: 'Bali',
  country: 'ID',
});
const critter = (id: string, set: string) => ({ id, key: `cp-${id}`, no: 2, seed: 2, set_id: set });

describe('sticker tray', () => {
  it('builds tabs, silhouettes, recent and the dex count', () => {
    const tray = buildStickerTray(
      [
        form('rare-tokek', 'tokek', 'bali'),
        form('common-tokek', 'tokek', 'bali'),
        form('pon', 'pon', 'kyoto'),
      ],
      [
        critter('tokek', 'bali'),
        critter('ora', 'bali'),
        critter('pon', 'kyoto'),
        critter('kukang', 'bali'),
      ],
      [
        { form_id: 'pon', pose: 'cheer' },
        { form_id: 'pon', pose: 'cheer' },
        { form_id: 'gone', pose: 'wave' },
        { form_id: 'rare-tokek', pose: 'dance' },
        { form_id: 'rare-tokek', pose: 'sleep' },
      ],
    );
    expect(tray.tabs.map((tab) => tab.form.formId)).toEqual(['rare-tokek', 'pon']);
    expect(tray.tabs[0]?.stickers.map((sticker) => sticker.pose)).toEqual([
      'wave',
      'cheer',
      'think',
      'point',
      'sleep',
    ]);
    expect(tray.tabs[0]?.locked.map((locked) => locked.critterId)).toEqual(['ora', 'kukang']);
    expect(tray.tabs[1]?.locked).toEqual([]);
    expect(tray.recent.map((s) => `${s.form.formId}:${s.pose}`)).toEqual([
      'pon:cheer',
      'rare-tokek:sleep',
    ]);
    expect([tray.met, tray.total]).toEqual([2, 4]);
  });
});
