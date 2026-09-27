/**
 * Request-time analytics from the api (`serverTrack`), for facts no domain event records: the link
 * resolver's `link_clicked` (with `is_bot`) and `/v1/actions`' `widget_action`, `la_started` and
 * `notification_delivered` with `surface` set (extensions carry no analytics SDK). Same consent
 * rules as the domain-event export: a consented user is sent under their pid; an event about a
 * user without consent is skipped unless it is on the `NO_CONSENT_ALLOWED` list; an event about
 * no person (an anonymous link click) is sent with no person profile under a per-event id.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import {
  guardAnalyticsEvent,
  isNoConsentAllowed,
  userPid,
  type AnalyticsEventName,
  type AnalyticsEventProps,
} from '@cp/domain';
import type pg from 'pg';
import { PostHog, type PostHogOptions } from 'posthog-node';

import { POSTHOG_EU_HOST } from './flags';

export interface ServerAnalyticsOptions {
  readonly pool: pg.Pool;
  readonly projectApiKey: string | undefined;
  readonly pidSalt: string | undefined;
  readonly host?: string | undefined;
  readonly onError?: (error: unknown) => void;
  /** Network boundary override and batching (tests). */
  readonly sdk?: Partial<PostHogOptions>;
}

export type ServerTrackOutcome = 'sent' | 'skipped_no_consent' | 'rejected' | 'disabled';

export interface ServerAnalytics {
  serverTrack<N extends AnalyticsEventName>(
    event: N,
    properties: AnalyticsEventProps<N>,
    subject: { readonly uid: string | null },
  ): Promise<ServerTrackOutcome>;
  shutdown(): Promise<void>;
}

async function hasAnalyticsConsent(pool: pg.Pool, uid: string): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ granted: boolean }>(
      `SELECT (granted_at IS NOT NULL AND revoked_at IS NULL) AS granted FROM consents
        WHERE user_id = $1 AND purpose = 'analytics' ORDER BY updated_at DESC LIMIT 1`,
      [uid],
    );
    return rows[0]?.granted === true;
  });
}

export function createServerAnalytics(options: ServerAnalyticsOptions): ServerAnalytics {
  const { projectApiKey, pidSalt } = options;
  if (!projectApiKey || !pidSalt) {
    return {
      serverTrack: () => Promise.resolve('disabled'),
      shutdown: () => Promise.resolve(),
    };
  }
  const client = new PostHog(projectApiKey, {
    host: options.host ?? POSTHOG_EU_HOST,
    disableGeoip: true,
    flushAt: 50,
    flushInterval: 5_000,
    ...options.sdk,
  });
  if (options.onError) client.on('error', options.onError);

  return {
    async serverTrack(event, properties, subject) {
      const guarded = guardAnalyticsEvent(event, { platform: 'server', ...properties });
      if (!guarded.ok) {
        options.onError?.(
          new Error(`analytics ${event} rejected: ${guarded.reason} ${guarded.detail}`),
        );
        return 'rejected';
      }
      const uuid = randomUUID();
      if (subject.uid !== null && (await hasAnalyticsConsent(options.pool, subject.uid))) {
        const pid = await userPid(subject.uid, pidSalt);
        client.capture({
          distinctId: pid,
          event,
          uuid,
          properties: { ...guarded.properties, user_pid: pid },
        });
        return 'sent';
      }
      if (subject.uid !== null && !isNoConsentAllowed(event)) return 'skipped_no_consent';
      client.capture({
        distinctId: `srv_${uuid}`,
        event,
        uuid,
        properties: { ...guarded.properties, $process_person_profile: false },
      });
      return 'sent';
    },
    shutdown: () => client.shutdown(),
  };
}
