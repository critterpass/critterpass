/**
 * Reading a shared driver message into a card the traveller then checks line by line (6c-2). A
 * refusal, an unparseable reply or a failed call answers null, and the app shows what it could not
 * read (6c-3) with TYPE THE REST IN.
 */
import type { ParsedIntake } from '@cp/domain';

import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import {
  buildProviderExtractRequest,
  PROVIDER_EXTRACT_ROUTE,
  type ProviderExtractRequestInput,
} from './prompt';
import {
  providerExtractReplySchema,
  validateProviderReply,
  type ValidateProviderOptions,
} from './schema';

export * from './prompt';
export * from './schema';

export async function extractProvider(
  gateway: Pick<Gateway, 'callModel'>,
  input: ProviderExtractRequestInput & ValidateProviderOptions,
  context: UsageContext = {},
): Promise<ParsedIntake | null> {
  try {
    const result = await gateway.callModel(
      PROVIDER_EXTRACT_ROUTE,
      buildProviderExtractRequest(input),
      context,
    );
    if (isDeclined(result.message)) return null;
    const reply = providerExtractReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    return reply.success ? validateProviderReply(reply.data, input.text, input) : null;
  } catch {
    return null;
  }
}
