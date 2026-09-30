/**
 * The owner's dietary and accessibility profile (C3): it leaves the phone only in
 * `set_dietary_profile`, and comes back only to its owner through `GET /v1/me/private/dietary`,
 * cached here in the encrypted local-only `local_private` table (never synced, wiped on sign-out).
 * The crew and the guide see derived flags ("vegetarian", "no peanuts") only while visibility is
 * `crew_flags` and the `dietary_visibility` consent stands: sharing asks for the consent first,
 * and withdrawing it deletes the flags.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire values, never copy. */
import type { PrivateDietaryWire, SetDietaryProfilePayload } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { defineClientCommand } from '@/data/commands/summaries';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { msg } from '@lingui/core/macro';

import { useLiveQuery } from '../chat/data/live-rows';

export const DIETARY_KIND = 'dietary';
/** The consent copy the sheet shows, kept as evidence of what was agreed to. */
export const DIETARY_CONSENT_COPY = 'dietary-2026-09';

export type DietaryProfile = Omit<PrivateDietaryWire, 'consent_at' | 'updated_at'>;

export const EMPTY_PROFILE: DietaryProfile = {
  diet: null,
  allergies: [],
  avoid: [],
  spice: null,
  accessibility_notes: null,
  visibility: 'self',
};

/** The command's payload as the app sends it (arrays may be read-only here). */
type ProfilePayload = Omit<SetDietaryProfilePayload, 'allergies' | 'avoid'> & {
  readonly allergies: readonly string[];
  readonly avoid: readonly string[];
};

export const setDietaryProfileCommand = defineClientCommand<ProfilePayload>({
  name: 'set_dietary_profile',
  offline: true,
  summarize: () => msg({ id: 'guide.dietary.queued', message: 'Your food and access needs' }),
});

export const setDietaryConsentCommand = defineClientCommand<{
  readonly purpose: 'dietary_visibility';
  readonly granted: boolean;
  readonly copy_version: string;
}>({
  name: 'set_consent',
  offline: true,
  summarize: () => msg({ id: 'guide.dietary.queuedConsent', message: 'Sharing food flags' }),
});

export type DietaryRead =
  | { readonly kind: 'ok'; readonly value: PrivateDietaryWire }
  | { readonly kind: 'not_set' }
  | { readonly kind: 'offline' };

export interface DietaryServices {
  readonly read: () => Promise<DietaryRead>;
}

/** Replaces the phone's copy with the server's (a no-op offline: the last copy stays). */
export async function refreshDietary(
  db: AbstractPowerSyncDatabase,
  services: DietaryServices,
  now: Date,
): Promise<void> {
  const read = await services.read();
  if (read.kind === 'offline') return;
  if (read.kind === 'not_set') {
    await db.execute('DELETE FROM local_private WHERE id = ?', [DIETARY_KIND]);
    return;
  }
  const { consent_at: _consent, updated_at: _updated, ...profile } = read.value;
  await storeDietary(db, profile, now);
}

export async function storeDietary(
  db: AbstractPowerSyncDatabase,
  profile: DietaryProfile,
  now: Date,
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM local_private WHERE id = ?', [DIETARY_KIND]);
    await tx.execute('INSERT INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)', [
      DIETARY_KIND,
      DIETARY_KIND,
      JSON.stringify(profile),
      now.toISOString(),
    ]);
  });
}

export function parseProfile(data: string | null | undefined): DietaryProfile | null {
  if (data === null || data === undefined) return null;
  try {
    const parsed = JSON.parse(data) as Partial<DietaryProfile>;
    return {
      diet: parsed.diet ?? null,
      allergies: Array.isArray(parsed.allergies) ? parsed.allergies : [],
      avoid: Array.isArray(parsed.avoid) ? parsed.avoid : [],
      spice: parsed.spice ?? null,
      accessibility_notes: parsed.accessibility_notes ?? null,
      visibility: parsed.visibility === 'crew_flags' ? 'crew_flags' : 'self',
    };
  } catch {
    return null;
  }
}

const SQL = `SELECT
    (SELECT data FROM local_private WHERE id = '${DIETARY_KIND}') AS data,
    (SELECT count(*) FROM consents c
      WHERE c.user_id = (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}')
        AND c.purpose = 'dietary_visibility' AND c.granted_at IS NOT NULL AND c.revoked_at IS NULL) AS consented`;

export interface DietaryState {
  readonly loading: boolean;
  readonly profile: DietaryProfile | null;
  readonly consented: boolean;
}

export function useDietary(): DietaryState {
  const rows = useLiveQuery<{ data: string | null; consented: number }>(
    SQL,
    [],
    ['local_private', 'consents', 'local_state'],
  );
  const row = rows?.[0];
  return {
    loading: rows === null,
    profile: parseProfile(row?.data),
    consented: (row?.consented ?? 0) > 0,
  };
}

/** Saving the profile: the phone's copy at once, the command through the offline queue. */
export function useSaveDietary() {
  const { db } = useLocalFirst();
  const profile = useCommand(setDietaryProfileCommand);
  const consent = useCommand(setDietaryConsentCommand);

  const save = useCallback(
    async (next: DietaryProfile, options: { readonly grantConsent?: boolean } = {}) => {
      await storeDietary(db, next, new Date());
      if (options.grantConsent === true) {
        await consent.send({
          purpose: 'dietary_visibility',
          granted: true,
          copy_version: DIETARY_CONSENT_COPY,
        });
      }
      await profile.send(next);
    },
    [db, profile, consent],
  );

  /** Stops sharing: the consent is withdrawn (the crew's flags are deleted) and visibility is self. */
  const stopSharing = useCallback(
    async (current: DietaryProfile) => {
      const next = { ...current, visibility: 'self' as const };
      await storeDietary(db, next, new Date());
      await consent.send({
        purpose: 'dietary_visibility',
        granted: false,
        copy_version: DIETARY_CONSENT_COPY,
      });
      await profile.send(next);
    },
    [db, profile, consent],
  );

  return { save, stopSharing, pending: profile.pending || consent.pending };
}
