import { describe, expect, it } from 'vitest';

import {
  checkPlausibility,
  MOCK_FLAG_ACCESSORY,
  MOCK_FLAG_IMPLAUSIBLE,
  MOCK_FLAG_SIMULATED,
  rejectsEvidence,
  type FixEvidence,
} from '../plausibility';

const base: FixEvidence = {
  lat: -8.5069,
  lng: 115.2625,
  accuracyM: 10,
  at: 0,
  simulated: false,
  accessory: false,
};

/** ~1.11 km north of `base`. */
const north1km = { lat: base.lat + 0.01, lng: base.lng };

describe('checkPlausibility', () => {
  it('passes an honest first fix and a walking pace', () => {
    expect(checkPlausibility(null, base)).toEqual({ flags: 0, reasons: [] });
    const walked = { ...base, ...north1km, at: 15 * 60_000 };
    expect(checkPlausibility(base, walked)).toEqual({ flags: 0, reasons: [] });
  });

  it('flags software simulation and records an accessory without calling it a spoof', () => {
    const simulated = checkPlausibility(null, { ...base, simulated: true });
    expect(simulated).toEqual({ flags: MOCK_FLAG_SIMULATED, reasons: ['simulated'] });
    const accessory = checkPlausibility(null, { ...base, accessory: true });
    expect(accessory).toEqual({ flags: MOCK_FLAG_ACCESSORY, reasons: [] });
    expect(rejectsEvidence(accessory.flags)).toBe(false);
    expect(rejectsEvidence(simulated.flags)).toBe(true);
  });

  it('flags a jump faster than 250 km/h', () => {
    // 1.1 km in 10 s = ~400 km/h.
    const result = checkPlausibility(base, { ...base, ...north1km, at: 10_000 });
    expect(result).toEqual({ flags: MOCK_FLAG_IMPLAUSIBLE, reasons: ['too_fast'] });
    expect(rejectsEvidence(result.flags)).toBe(true);
    // The same jump is fine for a custom limit (a flight tracker).
    expect(checkPlausibility(base, { ...base, ...north1km, at: 10_000 }, 1000).flags).toBe(0);
  });

  it('flags a teleport: a real distance at the same or an earlier instant', () => {
    expect(checkPlausibility(base, { ...base, ...north1km, at: 0 }).reasons).toEqual(['teleport']);
    expect(checkPlausibility(base, { ...base, ...north1km, at: -1 }).flags).toBe(
      MOCK_FLAG_IMPLAUSIBLE,
    );
  });

  it('never reads jitter inside both accuracy circles as movement', () => {
    const jitter = { ...base, lat: base.lat + 0.0001, at: 0, accuracyM: 20 };
    expect(checkPlausibility(base, jitter).flags).toBe(0);
  });
});
