/**
 * Japan Meteorological Agency warnings (bosai JSON, one file per prefecture). For each watched area
 * the level is the most serious warning in force: emergency warning 4, warning 3, advisory 2, none
 * 1. Codes follow JMA's warning code table (02–09 warnings, 10–27 advisories, 32–38 emergency
 * warnings); statuses 発表 (issued) and 継続 (continuing) are in force, 解除 (lifted) is not.
 */
import type { HazardLevel } from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';
import { z } from 'zod';

import type { HazardReading } from './refresh';

const JMA_BASE = 'https://www.jma.go.jp/bosai/warning/data/warning';
const IN_FORCE = new Set(['発表', '継続']);

const warningFileSchema = z.object({
  reportDatetime: z.string(),
  headlineText: z.string().optional(),
  areaTypes: z.array(
    z.object({
      areas: z.array(
        z.object({
          code: z.string(),
          warnings: z.array(z.object({ code: z.string().optional(), status: z.string() })),
        }),
      ),
    }),
  ),
});

export function jmaPrefectureFile(areaCode: string): string {
  return `${JMA_BASE}/${areaCode.slice(0, 2)}0000.json`;
}

function levelOf(code: number): HazardLevel {
  if (code >= 32 && code <= 38) return 4;
  if (code >= 2 && code <= 9) return 3;
  if (code >= 10 && code <= 27) return 2;
  return 1;
}

function labelOf(level: HazardLevel): string {
  if (level >= 4) return 'Emergency warning in force';
  if (level === 3) return 'Warning in force';
  return level === 2 ? 'Advisory in force' : 'No warnings in force';
}

export function parseJmaWarnings(raw: unknown, areaCodes: readonly string[]): HazardReading[] {
  const file = warningFileSchema.parse(raw);
  const areas = file.areaTypes.flatMap((type) => type.areas);
  return areaCodes.flatMap((areaCode) => {
    const area = areas.find((candidate) => candidate.code === areaCode);
    if (area === undefined) return [];
    const level = area.warnings
      .filter((warning) => IN_FORCE.has(warning.status) && warning.code !== undefined)
      .map((warning) => levelOf(Number(warning.code)))
      .reduce<HazardLevel>((max, value) => (value > max ? value : max), 1);
    const reading: HazardReading = {
      source: 'jma',
      kind: 'weather_warning',
      subject: areaCode,
      level,
      level_label: labelOf(level),
      headline: `${labelOf(level)} (JMA area ${areaCode})`,
      source_url: 'https://www.jma.go.jp/bosai/warning/',
      issued_at: new Date(file.reportDatetime),
      expires_at: null,
    };
    return [reading];
  });
}

export async function fetchJma(
  http: SupplierHttp,
  areaCodes: readonly string[],
  signal?: AbortSignal,
): Promise<HazardReading[]> {
  const files = [...new Set(areaCodes.map(jmaPrefectureFile))];
  const readings: HazardReading[] = [];
  for (const file of files) {
    const response = await http.request({
      supplier: 'jma',
      endpoint: 'warning',
      url: file,
      timeoutMs: 30_000,
      ...(signal !== undefined ? { signal } : {}),
    });
    readings.push(...parseJmaWarnings(JSON.parse(response.body), areaCodes));
  }
  return readings;
}
