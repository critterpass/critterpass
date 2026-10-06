import { describe, expect, it, jest } from '@jest/globals';

import { bundledAppIconKeys } from '@/lib/app-icon';

import { chooseIcon, iconToRecord, pickerModel, type PickerInput } from '../picker-model';

const BUNDLED = ['face', 'pon', 'sardi', 'temple'];
const input = (over: Partial<PickerInput> = {}): PickerInput => ({
  bundled: bundledAppIconKeys(BUNDLED),
  previewed: new Set(['face', 'passport', 'pon', 'sardi', 'temple', 'stamp']),
  currentNativeName: null,
  unlocks: [],
  passPlus: false,
  ...over,
});

describe('app icon picker', () => {
  it('offers only bundled icons, the primary one in use and earned ones locked until unlocked', () => {
    const model = pickerModel(input());
    expect(model.styles.map((c) => [c.id, c.state])).toEqual([
      ['face', 'available'],
      ['passport', 'in_use'],
    ]);
    expect(model.earned.map((c) => [c.id, c.state])).toEqual([
      ['temple', 'locked'],
      ['sardi', 'locked'],
      ['pon', 'locked'],
    ]);
    expect(model.earnedUnlocked).toBe(0);
  });

  it('opens an earned icon once unlocked, marks it new until seen, and reads the device icon', () => {
    const model = pickerModel(
      input({
        currentNativeName: 'sardi',
        unlocks: [
          { iconKey: 'sardi', seen: false },
          { iconKey: 'pon', seen: false },
          { iconKey: 'temple', seen: true },
        ],
      }),
    );
    expect(model.current).toBe('sardi');
    expect(model.earned.map((c) => [c.id, c.state, c.isNew])).toEqual([
      ['temple', 'available', false],
      ['sardi', 'in_use', false],
      ['pon', 'available', true],
    ]);
    expect(model.styles.find((c) => c.id === 'passport')?.state).toBe('available');
    expect(model.earnedUnlocked).toBe(3);
  });

  it('switches the device first and records the choice after', async () => {
    const calls: string[] = [];
    const ports = {
      setNative: jest.fn((name: string | null) => {
        calls.push(`native:${String(name)}`);
        return Promise.resolve();
      }),
      record: jest.fn((payload: { icon_id: string }) => {
        calls.push(`record:${payload.icon_id}`);
        return Promise.resolve();
      }),
    };
    const face = pickerModel(input()).styles[0];
    if (face === undefined) throw new Error('no face');
    expect(await chooseIcon(face, ports)).toBe('changed');
    expect(calls).toEqual(['native:face', 'record:face']);

    // Back to the primary icon: no alternate name.
    const passport = pickerModel(input({ currentNativeName: 'face' })).styles[1];
    if (passport === undefined) throw new Error('no passport');
    await chooseIcon(passport, ports);
    expect(ports.setNative).toHaveBeenLastCalledWith(null);
  });

  it('never switches to a locked icon, and says so when the device refuses', async () => {
    const ports = {
      setNative: jest.fn(() => Promise.reject(new Error('refused'))),
      record: jest.fn(() => Promise.resolve()),
    };
    const model = pickerModel(input());
    const [temple] = model.earned;
    const [face, passport] = model.styles;
    if (temple === undefined || face === undefined || passport === undefined) throw new Error();
    expect(await chooseIcon(temple, ports)).toBe('locked');
    expect(await chooseIcon(passport, ports)).toBe('unchanged');
    expect(ports.setNative).not.toHaveBeenCalled();
    expect(await chooseIcon(face, ports)).toBe('failed');
    expect(ports.record).not.toHaveBeenCalled();
  });

  it('keeps the switch when the account cannot be told, and sends the copy again later', async () => {
    const ports = {
      setNative: jest.fn(() => Promise.resolve()),
      record: jest.fn(() => Promise.reject(new Error('offline'))),
    };
    const face = pickerModel(input()).styles[0];
    if (face === undefined) throw new Error('no face');
    expect(await chooseIcon(face, ports)).toBe('changed');
    expect(iconToRecord('face', 'passport')).toEqual({ icon_id: 'face', appearance: 'auto' });
    expect(iconToRecord('face', 'face')).toBeNull();
    expect(iconToRecord(null, null)).toBeNull();
    expect(iconToRecord(null, 'face')).toEqual({ icon_id: 'passport', appearance: 'auto' });
    expect(iconToRecord('not-an-icon', 'face')).toBeNull();
  });
});
