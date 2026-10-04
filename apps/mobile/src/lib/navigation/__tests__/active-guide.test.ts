import { afterEach, describe, expect, it } from '@jest/globals';

import {
  applyGuidesPerCity,
  guidesPerCity,
  readGuidesPerCity,
  resetGuidesPerCity,
  setGuidesPerCityOverride,
} from '../active-guide';

afterEach(() => {
  setGuidesPerCityOverride(null);
  resetGuidesPerCity();
});

describe('whether guides go by city', () => {
  it('is off until the synced config says otherwise', () => {
    expect(guidesPerCity()).toBe(false);
    applyGuidesPerCity(true);
    expect(guidesPerCity()).toBe(true);
    applyGuidesPerCity(false);
    expect(guidesPerCity()).toBe(false);
  });

  it("lets this phone's override win over the synced value, either way", () => {
    applyGuidesPerCity(false);
    setGuidesPerCityOverride(true);
    expect(guidesPerCity()).toBe(true);
    applyGuidesPerCity(true);
    setGuidesPerCityOverride(false);
    expect(guidesPerCity()).toBe(false);
    setGuidesPerCityOverride(null);
    expect(guidesPerCity()).toBe(true);
  });

  it('forgets the synced value on sign-out and keeps the override', () => {
    applyGuidesPerCity(true);
    resetGuidesPerCity();
    expect(guidesPerCity()).toBe(false);
    setGuidesPerCityOverride(true);
    resetGuidesPerCity();
    expect(guidesPerCity()).toBe(true);
  });

  it('reads the config value as synced: JSON text or the bare value', () => {
    expect(readGuidesPerCity('true')).toBe(true);
    expect(readGuidesPerCity(true)).toBe(true);
    expect(readGuidesPerCity(1)).toBe(true);
    expect(readGuidesPerCity('false')).toBe(false);
    expect(readGuidesPerCity(null)).toBe(false);
  });
});
