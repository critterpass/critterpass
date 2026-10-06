/**
 * App accounts as the console sees them: lookup by e-mail or phone, ban state, sessions, and the
 * three account actions (revoke one session, ban, unban). Everything goes through the *app's* Better
 * Auth instance, never a raw `auth.*` write: its Redis session mirror is read before Postgres, so
 * only its own adapter makes a revoked session or a ban take effect on the very next api call.
 * A revoke or ban then fans out like the app's own sign-out (realtime disconnect on `user:#uid`,
 * device action keys revoked).
 *
 * E-mail and phone number are lookup keys only (the privacy map files both under C3): the console
 * learns whether an account has one, never the value.
 */
import type pg from 'pg';

import { fanOutSessionRevoked } from '../auth/guards';

export interface AccountSummary {
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly hasEmail: boolean;
  readonly hasPhone: boolean;
  readonly banned: boolean;
  readonly banReason: string | null;
  readonly banExpires: Date | null;
  readonly createdAt: Date;
}

export interface SessionSummary {
  readonly id: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Browser / app user agent, shortened; the session's IP is never shown. */
  readonly userAgent: string | null;
}

export interface BanInput {
  readonly reason: string;
  /** `null` = until an operator unbans. */
  readonly until: Date | null;
}

export interface AccountControl {
  findByEmail(email: string): Promise<string | null>;
  findByPhone(phone: string): Promise<string | null>;
  account(uid: string): Promise<AccountSummary | null>;
  sessions(uid: string): Promise<readonly SessionSummary[]>;
  /** False when the session is not (or no longer) one of the user's. */
  revokeSession(uid: string, sessionId: string): Promise<boolean>;
  /** Ends every app session of the user (never a console session); answers how many were live. */
  revokeAllSessions(uid: string): Promise<number>;
  ban(uid: string, input: BanInput): Promise<void>;
  unban(uid: string): Promise<void>;
}

interface AuthUserRecord {
  id: string;
  email: string;
  isAnonymous?: boolean | null;
  phoneNumber?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  banExpires?: Date | string | null;
  createdAt: Date | string;
}

interface AuthSessionRecord {
  id: string;
  token: string;
  userId: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  userAgent?: string | null;
}

interface InternalAdapter {
  findUserById(id: string): Promise<AuthUserRecord | null>;
  findUserByEmail(email: string): Promise<{ user: AuthUserRecord } | null>;
  deleteSession(token: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  updateUser(userId: string, data: Record<string, unknown>): Promise<unknown>;
}

interface AuthContext {
  internalAdapter: InternalAdapter;
  adapter: {
    findOne<T>(query: {
      model: string;
      where: { field: string; value: string }[];
    }): Promise<T | null>;
    findMany<T>(query: { model: string; where: { field: string; value: string }[] }): Promise<T[]>;
  };
}

/** The slice of the app's Better Auth instance this needs. */
export interface AppAuthHandle {
  readonly $context: Promise<unknown>;
}

const PLACEHOLDER_EMAIL = /@anonymous\.placeholder\.invalid$/;
const E164 = /^\+[1-9]\d{6,14}$/;

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

export function createAccountControl(appAuth: AppAuthHandle, pool: pg.Pool): AccountControl {
  const context = async () => (await appAuth.$context) as AuthContext;
  // Sessions are stored in Postgres as well as the Redis mirror (`storeSessionInDatabase`), so the
  // table is the complete list; revoking goes through the adapter, which clears both.
  const liveSessions = async (uid: string) => {
    const rows = await (
      await context()
    ).adapter.findMany<AuthSessionRecord>({
      model: 'session',
      where: [{ field: 'userId', value: uid }],
    });
    const now = Date.now();
    return rows.filter((row) => toDate(row.expiresAt).getTime() > now);
  };

  return {
    async findByEmail(email) {
      const found = await (await context()).internalAdapter.findUserByEmail(email.toLowerCase());
      return found?.user.id ?? null;
    },
    async findByPhone(phone) {
      if (!E164.test(phone)) return null;
      const user = await (
        await context()
      ).adapter.findOne<AuthUserRecord>({
        model: 'user',
        where: [{ field: 'phoneNumber', value: phone }],
      });
      return user?.id ?? null;
    },
    async account(uid) {
      const user = await (await context()).internalAdapter.findUserById(uid);
      if (user === null) return null;
      return {
        uid: user.id,
        isAnonymous: user.isAnonymous === true,
        hasEmail: !PLACEHOLDER_EMAIL.test(user.email),
        hasPhone: Boolean(user.phoneNumber),
        banned: user.banned === true,
        banReason: user.banReason ?? null,
        banExpires: user.banExpires ? toDate(user.banExpires) : null,
        createdAt: toDate(user.createdAt),
      };
    },
    async sessions(uid) {
      const sessions = await liveSessions(uid);
      return sessions
        .map((session) => ({
          id: session.id,
          createdAt: toDate(session.createdAt),
          expiresAt: toDate(session.expiresAt),
          userAgent: session.userAgent ? session.userAgent.slice(0, 160) : null,
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async revokeSession(uid, sessionId) {
      const session = (await liveSessions(uid)).find((entry) => entry.id === sessionId);
      if (session === undefined) return false;
      await (await context()).internalAdapter.deleteSession(session.token);
      await fanOutSessionRevoked(pool, uid);
      return true;
    },
    async revokeAllSessions(uid) {
      const live = (await liveSessions(uid)).length;
      await (await context()).internalAdapter.deleteUserSessions(uid);
      await fanOutSessionRevoked(pool, uid);
      return live;
    },
    async ban(uid, input) {
      const adapter = (await context()).internalAdapter;
      await adapter.updateUser(uid, {
        banned: true,
        banReason: input.reason,
        banExpires: input.until,
      });
      await adapter.deleteUserSessions(uid);
      await fanOutSessionRevoked(pool, uid);
    },
    async unban(uid) {
      await (
        await context()
      ).internalAdapter.updateUser(uid, { banned: false, banReason: null, banExpires: null });
    },
  };
}
