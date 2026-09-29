/**
 * The Email Worker entry: Cloudflare Email Routing hands every message for the `in.` subdomain to
 * `email()`, which runs the handler with the real bindings, the platform's `fetch` and replies
 * sent through `message.reply` (threaded, from the crew address).
 */
import { EmailMessage } from 'cloudflare:email';

import { handleInbound, type InboundEnv } from './handler';

export default {
  async email(message: ForwardableEmailMessage, env: InboundEnv): Promise<void> {
    await handleInbound(message, env, {
      fetch: (input, init) => fetch(input, init),
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
      reply: async (raw) => {
        await message.reply(new EmailMessage(message.to, message.from, raw));
      },
    });
  },
} satisfies ExportedHandler<InboundEnv>;
