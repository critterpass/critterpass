/**
 * The Help hub's two reads over HTTPS with the session headers: `GET /v1/help/context` (the street
 * the traveller is on, facilities by drive time) and `GET /v1/help/checklist` (one problem's steps
 * in the guide's words). Both are optional enrichments: offline, the hub and the checklists are
 * built from synced rows alone. A failed or offline read answers `null`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths, query names and header values. */
import {
  checklistStepSchema,
  helpContextSchema,
  type ChecklistStep,
  type HelpContext,
  type HelpProblem,
} from '@cp/domain';
import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

export interface Position {
  readonly lat: number;
  readonly lng: number;
}

export interface HelpApi {
  context(tripId: string, at: Position | null): Promise<HelpContext | null>;
  checklist(
    tripId: string,
    problem: HelpProblem,
    at: Position | null,
  ): Promise<readonly ChecklistStep[] | null>;
}

function query(tripId: string, at: Position | null, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ trip_id: tripId, ...extra });
  if (at !== null) {
    params.set('lat', at.lat.toFixed(5));
    params.set('lng', at.lng.toFixed(5));
  }
  return params.toString();
}

async function getJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  }
}

export const deviceHelpApi: HelpApi = {
  async context(tripId, at) {
    const parsed = helpContextSchema.safeParse(
      await getJson(`/v1/help/context?${query(tripId, at)}`),
    );
    return parsed.success ? parsed.data : null;
  },
  async checklist(tripId, problem, at) {
    const body = await getJson(`/v1/help/checklist?${query(tripId, at, { problem })}`);
    const parsed = checklistStepSchema
      .array()
      .safeParse((body as { steps?: unknown } | null)?.steps);
    return parsed.success ? parsed.data : null;
  },
};
