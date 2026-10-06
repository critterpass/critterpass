/**
 * The driver directory's deps from the api env: the field keyring and phone pepper (unset = invites
 * and the claim page answer SUPPLIER_UNAVAILABLE), the link host, and the WhatsApp code sender
 * (the sign-in template; the store-review and test numbers get their fixed code instead).
 */
import { buildOtpAdaptersFromEnv } from '../../auth/bootstrap';
import { fixedCodeNumbersFromEnv } from '../../auth/otp/fixed-codes';
import type { ApiEnv } from '../../env';
import type { OtpSender } from '../../routes/public-driver-claims';
import type { DriverDirectoryDeps } from './shared';

const LINK_ENV = { production: 'production', staging: 'staging', local: 'development' } as const;

export function driverDirectoryDepsFromEnv(
  env: ApiEnv,
  keyring: DriverDirectoryDeps['keyring'] | undefined,
  warn: (message: string) => void,
): DriverDirectoryDeps & { readonly otp: OtpSender | null } {
  const whatsapp = buildOtpAdaptersFromEnv(env).whatsapp;
  const fixed = fixedCodeNumbersFromEnv(env, warn);
  return {
    keyring: keyring ?? null,
    pepper: env.PHONE_HASH_PEPPER ?? null,
    linkEnv: LINK_ENV[env.APP_ENV],
    otp:
      whatsapp === undefined
        ? null
        : {
            send: async (phoneE164, code) => {
              await whatsapp.send({ phoneE164, code });
            },
            fixedCode: (phoneE164) => fixed?.match(phoneE164)?.code,
          },
  };
}
