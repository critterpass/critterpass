import { describe, expect, it, jest } from '@jest/globals';

import { bundledAppIconKeys } from '@/lib/app-icon';

import {
  chooseIcon,
  iconStylesOpen,
  iconToRecord,
  lockedIconAction,
  pickerModel,
  revertLapsedIcon,
  type PickerInput,
} from '../picker-model';

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

  it('sends a locked Pass+ style to the paywall and opens it with Pass+, active or paused', () => {
    const withStamp = { bundled: bundledAppIconKeys([...BUNDLED, 'stamp']) };
    const locked = pickerModel(input(withStamp)).styles.find((c) => c.id === 'stamp');
    if (locked === undefined) throw new Error('no stamp');
    expect(locked.state).toBe('locked');
    expect(lockedIconAction(locked)).toBe('paywall');
    const [temple] = pickerModel(input(withStamp)).earned;
    if (temple === undefined) throw new Error('no temple');
    expect(lockedIconAction(temple)).toBe('how_to_earn');

    expect(iconStylesOpen(undefined)).toBe(false);
    expect(iconStylesOpen({ pass_plus: 0, icon_styles: '[]' })).toBe(false);
    expect(iconStylesOpen({ pass_plus: 1, icon_styles: '[]' })).toBe(true);
    // Paused: Pass+ is off but the styles stay.
    expect(iconStylesOpen({ pass_plus: 0, icon_styles: '["all"]' })).toBe(true);
    const open = pickerModel(input({ ...withStamp, passPlus: true }));
    expect(open.styles.find((c) => c.id === 'stamp')?.state).toBe('available');
    // A style this build does not bundle is never listed.
    expect(pickerModel(input()).styles.some((c) => c.id === 'stamp')).toBe(false);
  });

  it('puts the default icon back when Pass+ lapsed under a Pass+ style, and only then', async () => {
    const ports = (current: string | null) => ({
      getCurrent: jest.fn(() => Promise.resolve(current)),
      setNative: jest.fn((_name: string | null) => Promise.resolve()),
      record: jest.fn((_payload: { icon_id: string }) => Promise.resolve()),
    });
    const lapsed = ports('stamp');
    expect(await revertLapsedIcon(false, lapsed)).toBe(true);
    expect(lapsed.setNative).toHaveBeenCalledWith(null);
    expect(lapsed.record).toHaveBeenCalledWith({ icon_id: 'passport', appearance: 'auto' });

    for (const [open, current] of [
      [true, 'stamp'],
      [false, 'face'],
      [false, 'temple'],
      [false, null],
    ] as const) {
      const kept = ports(current);
      expect(await revertLapsedIcon(open, kept)).toBe(false);
      expect(kept.setNative).not.toHaveBeenCalled();
    }

    const refused = { ...ports('stamp'), setNative: jest.fn(() => Promise.reject(new Error())) };
    expect(await revertLapsedIcon(false, refused)).toBe(false);
    expect(refused.record).not.toHaveBeenCalled();
  });
});
