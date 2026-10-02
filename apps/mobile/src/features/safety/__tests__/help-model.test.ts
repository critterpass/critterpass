import { describe, expect, it } from '@jest/globals';
import type { EmergencyLine, HelpContext, HelpPhrase } from '@cp/domain';

import { buildHubModel, type FacilityRow, type HelpLocalInput } from '../help/help-model';
import { localChecklist, readsPhraseLanguage, withDesk, withPhrase } from '../help/checklist-model';
import { isOn } from '../data/ops-desk-flag';

const VIETNAM: readonly EmergencyLine[] = [
  { service: 'police', number: '113', label: 'Police' },
  { service: 'ambulance', number: '115', label: 'Ambulance' },
  { service: 'fire', number: '114', label: 'Fire' },
  { service: 'other', number: '112', label: 'National search and rescue' },
  { service: 'other', number: '111', label: 'Child protection hotline' },
];

const facility = (
  id: string,
  kind: FacilityRow['kind'],
  lat: number,
  lng: number,
): FacilityRow => ({
  id,
  kind,
  name: id,
  phone: null,
  lat,
  lng,
  open_24h: 1,
});

const phrase = (key: string, text: string): HelpPhrase => ({
  key,
  context: key.split(':')[1] ?? '',
  language: 'vi',
  text,
  romanisation: null,
  gloss: text,
  audio_key: null,
});

const DA_NANG: HelpLocalInput = {
  country: 'Vietnam',
  lines: VIETNAM,
  facilities: [
    facility('far-hospital', 'hospital', 16.1, 108.25),
    facility('near-hospital', 'hospital', 16.06, 108.22),
    facility('pharmacy', 'pharmacy', 16.0601, 108.2201),
  ],
  phrases: [
    phrase('vi:emergency:need-doctor', 'Tôi cần bác sĩ'),
    phrase('vi:emergency:i-am-hurt', 'Tôi bị thương'),
  ],
  at: { lat: 16.0605, lng: 108.2205 },
};

describe('Help hub model, offline', () => {
  it('leads Vietnam with the ambulance, police on the side, from synced rows only', () => {
    const model = buildHubModel(DA_NANG, null);
    expect(model.coverage).toBe('full');
    expect(model.general).toEqual({ number: '115', label: 'Ambulance' });
    expect(model.side).toEqual({ number: '113', label: 'Police' });
    expect(model.lines.map((line) => line.number)).toEqual(['113', '115', '114', '112', '111']);
    expect(model.placeLabel).toBeNull();
  });

  it('picks the nearest medical facility by straight line and the country phrase', () => {
    const model = buildHubModel(DA_NANG, null);
    expect(model.facility?.id).toBe('near-hospital');
    expect(model.facility?.minutes).toBeNull();
    expect(model.phrase?.text).toBe('Tôi cần bác sĩ');
  });

  it('falls back to limited coverage with 112 where no numbers are curated', () => {
    const model = buildHubModel(
      { ...DA_NANG, country: 'Atlantis', lines: null, phrases: [] },
      null,
    );
    expect(model.coverage).toBe('limited');
    expect(model.general.number).toBe('112');
    expect(model.side).toBeNull();
    expect(model.phrase).toBeNull();
  });
});

describe('Help hub model, online', () => {
  it("takes the server's place label and drive minutes", () => {
    const context: HelpContext = {
      trip_id: '0192f000-0000-7000-8000-000000000001',
      country: 'VN',
      coverage: 'full',
      place_label: 'Bạch Đằng, Hải Châu',
      numbers: { general: '115', lines: [...VIETNAM], verified_at: null, source_url: null },
      facilities: [
        {
          id: '0192f000-0000-7000-8000-000000000002',
          kind: 'hospital',
          name: 'Hospital A',
          address: '',
          phone: null,
          lat: 16.1,
          lng: 108.2,
          minutes: 12,
          distance_m: 5000,
          estimate: false,
          open_now: true,
          insurance_match: false,
          verified_at: '2026-09-29T12:00:00Z',
        },
        {
          id: '0192f000-0000-7000-8000-000000000003',
          kind: 'clinic',
          name: 'Clinic B',
          address: '',
          phone: null,
          lat: 16.06,
          lng: 108.22,
          minutes: 4,
          distance_m: 900,
          estimate: false,
          open_now: null,
          insurance_match: false,
          verified_at: '2026-09-29T12:00:00Z',
        },
      ],
      phrases: [],
      active_share: null,
    };
    const model = buildHubModel(DA_NANG, context);
    expect(model.placeLabel).toBe('Bạch Đằng, Hải Châu');
    expect(model.facility).toMatchObject({ name: 'Clinic B', minutes: 4, open24h: false });
    expect(model.general.number).toBe('115');
  });
});

describe('Help checklists offline', () => {
  it('builds the hurt steps from synced facts: the facility, the phrase, the local number', () => {
    const steps = localChecklist(buildHubModel(DA_NANG, null), 'hurt');
    expect(steps.map((step) => step.kind)).toEqual([
      'nearest_facility',
      'phrase',
      'call_number',
      'insurance_line',
      'ops_clinic',
    ]);
    expect(steps.find((step) => step.kind === 'call_number')?.facts['number']).toBe('115');
    expect(steps.every((step) => step.text === null)).toBe(true);
  });

  it('reports a theft to the police number on file', () => {
    const steps = localChecklist(buildHubModel(DA_NANG, null), 'lost_stolen');
    expect(steps.find((step) => step.kind === 'police_report')?.facts['number']).toBe('113');
  });
});

describe('the ops desk switch', () => {
  it('offers the desk step only where a person staffs it', () => {
    const steps = localChecklist(buildHubModel(DA_NANG, null), 'hurt');
    expect(withDesk(steps, true).map((step) => step.kind)).toContain('ops_clinic');
    expect(withDesk(steps, false).map((step) => step.kind)).not.toContain('ops_clinic');
    expect(withDesk(steps, false)).toHaveLength(steps.length - 1);
  });

  it('is off unless the server says it is on', () => {
    expect(isOn(undefined)).toBe(false);
    expect(isOn(null)).toBe(false);
    expect(isOn('false')).toBe(false);
    expect(isOn('true')).toBe(true);
  });
});

describe('the phrase card', () => {
  it('is left out for a reader whose app language is the phrase language', () => {
    expect(readsPhraseLanguage('vi', 'vi')).toBe(true);
    expect(readsPhraseLanguage('vi-VN', 'vi')).toBe(true);
    expect(readsPhraseLanguage('en', 'vi')).toBe(false);
    expect(readsPhraseLanguage('pt-BR', 'pt-PT')).toBe(true);
  });

  it("takes the checklist's show-them step with it", () => {
    const steps = localChecklist(buildHubModel(DA_NANG, null), 'hurt');
    expect(withPhrase(steps, false).map((step) => step.kind)).not.toContain('phrase');
    expect(withPhrase(steps, true)).toHaveLength(steps.length);
  });
});
