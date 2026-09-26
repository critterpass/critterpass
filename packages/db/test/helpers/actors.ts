/**
 * Fixture identity helpers shared by transaction and permission tests. These ids are plain random
 * UUIDs with no backing row: app.uid()/app.device() are session variables, so RLS-backstop and
 * role-isolation tests need no row to exist. Permission fixtures that need real users/crews build
 * on top of these once the owning tables exist (see test/permissions/_matrix.ts).
 */
import { randomUUID } from 'node:crypto';

export interface TestActor {
  readonly uid: string;
  readonly device: string;
}

export function randomId(): string {
  return randomUUID();
}

/** A synthetic actor with no backing row, for RLS/session-variable tests. */
export function anonymousActor(): TestActor {
  return { uid: randomId(), device: randomId() };
}
