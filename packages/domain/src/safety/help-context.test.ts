import { describe, expect, it } from 'vitest';

import { emergencyNumbersFor, GSM_EMERGENCY_NUMBER, type EmergencyLine } from './help-context';

const line = (
  service: EmergencyLine['service'],
  number: string,
  label = service,
): EmergencyLine => ({
  service,
  number,
  label,
});

describe('emergencyNumbersFor', () => {
  it('falls back to the GSM number when a country has no curated lines', () => {
    expect(emergencyNumbersFor(null).general).toBe(GSM_EMERGENCY_NUMBER);
    expect(emergencyNumbersFor([]).lines).toEqual([
      { service: 'general', number: GSM_EMERGENCY_NUMBER, label: '' },
    ]);
  });

  it('leads with the one all-services line of a country that has one', () => {
    const lines = [line('police', '17'), line('ambulance', '15'), line('general', '112')];
    expect(emergencyNumbersFor(lines)).toEqual({ general: '112', lines });
  });

  it('leads with the ambulance where several lines share the general bucket', () => {
    const vietnam = [
      line('police', '113'),
      line('ambulance', '115'),
      line('fire', '114'),
      line('general', '112', 'National search and rescue'),
      line('general', '111', 'Child protection hotline'),
    ];
    expect(emergencyNumbersFor(vietnam)).toEqual({ general: '115', lines: vietnam });
  });

  it('leads with the ambulance when there is no general line, else the first line on file', () => {
    expect(emergencyNumbersFor([line('police', '110'), line('ambulance', '119')]).general).toBe(
      '119',
    );
    expect(emergencyNumbersFor([line('general', '112'), line('general', '999')]).general).toBe(
      '112',
    );
    expect(emergencyNumbersFor([line('police', '999')]).general).toBe('999');
  });
});
